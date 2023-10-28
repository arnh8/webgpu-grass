const pi = 3.14159265359;

struct myUniforms {
    projectionMatrix: mat4x4f,
    viewMatrix: mat4x4f,
    modelMatrix: mat4x4f, //R1 * T1 * S
    //color: vec4f,
    time: f32,
}

struct VertexInput {
    @location(0) pos: vec3f,
    @location(1) col: vec3f,
    @builtin(instance_index) instance: u32,
}

struct VertexOutput {
   @builtin(position) pos: vec4f,
   @location(0) col: vec3f
}

@group(0) @binding(0) var<uniform> uMyUniforms: myUniforms;
@group(0) @binding(1) var<storage, read> grassPositions: array<vec3<u32>, 64>;

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
    let i = input.instance;
    var output: VertexOutput;
    let transformx = f32(grassPositions[i].x);
    let transformz = f32(grassPositions[i].z);
    let transformed = vec4f(input.pos.x + transformx, input.pos.y, input.pos.z + transformz, 1.0);
    output.pos = uMyUniforms.projectionMatrix * uMyUniforms.viewMatrix 
                * uMyUniforms.modelMatrix * transformed;
    //output.pos.x = output.pos.x + f32(grassPositions[i].x);
    //output.pos.x = output.pos.x + f32(grassPositions[i].x) - 1;
    //output.pos.y = output.pos.y + f32(grassPositions[i].z) - 1;
    //output.pos.z = output.pos.z - 6;
    //output.pos.z = output.pos.z - 0.5 * f32(i) + 0.5;
    //output.pos.z = output.pos.z + f32(grassPositions[i].z);
    output.col = input.col;
    return output;
}

@fragment
fn fragmentMain(in: VertexOutput) -> @location(0) vec4f {
    return vec4f(in.col, 1); // (Red, Green, Blue, Alpha)
}


