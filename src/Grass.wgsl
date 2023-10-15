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

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    output.pos = uMyUniforms.projectionMatrix * uMyUniforms.viewMatrix * uMyUniforms.modelMatrix * vec4f(input.pos, 1.0);
    output.col = input.col;
    return output;
}

@fragment
fn fragmentMain(in: VertexOutput) -> @location(0) vec4f {
    return vec4f(in.col, 1); // (Red, Green, Blue, Alpha)
}


