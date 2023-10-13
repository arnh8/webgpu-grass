@group(0) @binding(0) var<uniform> uTime: f32;

const pi = 3.14159265359;

struct VertexInput {
    @location(0) pos: vec3f,
    @location(1) col: vec3f,
    @builtin(instance_index) instance: u32,
}

struct VertexOutput {
   @builtin(position) pos: vec4f,
   @location(0) col: vec3f
}

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    let angle = uTime * 0.02;
    let c1 = cos(angle);
    let s1 = sin(angle);
    let ratio = 1.0;
    var position = vec3f(
		input.pos.x,
		input.pos.y,
		input.pos.z,
	);
    let ScaleMatrix = transpose(mat3x3f(// in x    y    z
        0.5, 0.0, 0.0, // -> out x = 1.0 * x + 0.0 * y + 0.0 * z = x
        0.0, 0.5, 0.0, // -> out y = ratio * y
        0.0, 0.0, 0.5, // -> out z = 0.5 * z
    ));
    position = ScaleMatrix * position;

    let RotationMatrix1 = transpose(mat4x4f(// in x    y    z
         c1,  s1, 0.0, 0.0,// -> out x = 1.0 * x
        -s1,  c1, 0.0, 0.0,// -> out y =  cos * y + sin * z
        0.0, 0.0, 1.0, 0.0,// -> out z = -sin * y + cos * z
        0.0, 0.0, 0.0, 1.0,
    ));

    let angle2 = 3.0 * pi / 4.0; //three 8th of turn (1 turn = 2 pi)
    let c2 = cos(angle2);
    let s2 = sin(angle2);
    let RotationMatrix2 = transpose(mat4x4f(// in x    y    z
        1.0, 0.0, 0.0, 0.0,// -> out x = 1.0 * x
        0.0,  c2,  s2, 0.0,// -> out y =  cos * y + sin * z
        0.0, -s2,  c2, 0.0,// -> out z = -sin * y + cos * z
        0.0, 0.0, 0.0, 1.0,
    ));

    let T = transpose(mat4x4f(// in x    y    z    1.0
        1.0, 0.0, 0.0, 0.25, // -> out x = x + 0.25
        0.0, 1.0, 0.0, 0.0, // -> out y = y
        0.0, 0.0, 1.0, 0.0, // -> out z = z
        0.0, 0.0, 0.0, 1.0, // -> out w = 1.0
    ));

    let homo = vec4f(position, 1.0);
    position = (RotationMatrix2 * RotationMatrix1 * T * homo).xyz;

    // https://eliemichel.github.io/LearnWebGPU/basic-3d-rendering/3d-meshes/projection-matrices.html#focal-length 
    let focalLength = 2.0; //Level of zoom
    let near = 0.01;
    let far = 100.0;
    let scale = 1.0;
    let divides = 1.0 / (focalLength * (far - near));
    let P = transpose(mat4x4f(
        1.0,      0.0,           0.0,                  0.0,
            0.0,     ratio,      0.0,                  0.0,
            0.0,          0.0,      far * divides, - far * near * divides,
            0.0,          0.0,           1.0 / focalLength,                 0.0,
    ));
    
    

    let focalPoint = vec3f(0.0, 0.0, -2.0);
    position = position - focalPoint;

    //position.x /= position.z;
    //position.y /= position.z;
    
    
    output.pos = P * vec4f(position,1.0);
    //output.pos = vec4f(position.x, position.y, position.z * 0.5 + 0.5, 1);	
    output.pos.w = position.z / focalLength;
    output.col = input.col;
    return output;
}

@fragment
fn fragmentMain(in: VertexOutput) -> @location(0) vec4f {
    return vec4f(in.col, 1); // (Red, Green, Blue, Alpha)
}


