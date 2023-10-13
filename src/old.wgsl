//output.pos = vec4f(input.pos.x, input.pos.z, input.pos.y ,1);
///////////////////////////////////////////////////////////////////////////
@group(0) @binding(0) var<uniform> uTime: f32;

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
            var offset = vec2f(-0.2, -0.2);
            offset += 0.3 * vec2f(cos(uTime), sin(uTime));
            output.pos = vec4f(input.pos.x + offset.x, input.pos.z + offset.y, input.pos.y ,1);
            output.col = input.col;
            return output;
        }
        
        @fragment
        fn fragmentMain(in: VertexOutput) -> @location(0) vec4f {
            return vec4f(in.col, 1); // (Red, Green, Blue, Alpha)
        }
//
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
    output.pos = vec4f(input.pos.x, input.pos.z, input.pos.y ,1);
    output.col = input.col;
    return output;
}

@fragment
fn fragmentMain(in: VertexOutput) -> @location(0) vec4f {
    return vec4f(in.col, 1); // (Red, Green, Blue, Alpha)
}

////
var position = vec3f(
     alpha * input.pos.x + beta * input.pos.y,
     alpha * input.pos.y - beta * input.pos.x,
		- input.pos.z,);
        //Spin