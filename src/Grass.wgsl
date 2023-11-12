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
@group(0) @binding(1) var<storage, read> grassPositions: array<vec3<f32>, 64>;

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
    let i = input.instance;
    var output: VertexOutput;
    // Hash the instance num into rand -1-1
    let hash = perlinNoise2(vec2f(grassPositions[i].x * 0.1, grassPositions[i].z* 0.1));
    var multi: f32 = 0.0;
    if(hash < 0){
        multi = cos(uMyUniforms.time / 2 + (grassPositions[i].x+grassPositions[i].z))+0.8;
        // can be made more efficient by sampling a noise texture
    }
    else{
        multi = cos(uMyUniforms.time + (grassPositions[i].x+grassPositions[i].z))+0.8;
    }

    // Rotate a little : todo: implement TRUE billboarding so blades always face camera 
    // however most games dont hard billboard...
    let rotangle = f32(i);
    let tempx = sin(rotangle) * input.pos.z + cos(rotangle) * input.pos.x;
    let tempz = cos(rotangle) * input.pos.z - sin(rotangle) * input.pos.x;

    // Sway, taller vertexes "sway" more
    let transformx = f32(grassPositions[i].x) + 0.2 * multi * input.pos.y * input.pos.y ;
    let transformz = f32(grassPositions[i].z); // + 0.05 * input.pos.y * multi; 
    output.pos = vec4f(
        tempx + transformx, 
        input.pos.y * grassPositions[i].y + hash, // +gP[i] for height of grass, +hash for altitude
        tempz + transformz, 
        1.0);

    output.pos = 
        uMyUniforms.projectionMatrix 
        * uMyUniforms.viewMatrix 
        * uMyUniforms.modelMatrix 
        * output.pos;
    // Darken taller grass
    output.col.r = input.col.r - 0.1 * grassPositions[i].y;
    output.col.g = input.col.g - 0.1 * grassPositions[i].y;
    output.col.b = input.col.b - 0.1 * grassPositions[i].y;
    return output;
}

@fragment
fn fragmentMain(in: VertexOutput) -> @location(0) vec4f {
    return vec4f(in.col, 1); // (Red, Green, Blue, Alpha)
}

// https://gist.github.com/munrocket/236ed5ba7e409b8bdf1ff6eca5dcdc39 
// MIT License. © Stefan Gustavson, Munrocket
//
fn permute4(x: vec4f) -> vec4f { return ((x * 34. + 1.) * x) % vec4f(289.); }
fn fade2(t: vec2f) -> vec2f { return t * t * t * (t * (t * 6. - 15.) + 10.); }

fn perlinNoise2(P: vec2f) -> f32 {
    var Pi: vec4f = floor(P.xyxy) + vec4f(0., 0., 1., 1.);
    let Pf = fract(P.xyxy) - vec4f(0., 0., 1., 1.);
    Pi = Pi % vec4f(289.); // To avoid truncation effects in permutation
    let ix = Pi.xzxz;
    let iy = Pi.yyww;
    let fx = Pf.xzxz;
    let fy = Pf.yyww;
    let i = permute4(permute4(ix) + iy);
    var gx: vec4f = 2. * fract(i * 0.0243902439) - 1.; // 1/41 = 0.024...
    let gy = abs(gx) - 0.5;
    let tx = floor(gx + 0.5);
    gx = gx - tx;
    var g00: vec2f = vec2f(gx.x, gy.x);
    var g10: vec2f = vec2f(gx.y, gy.y);
    var g01: vec2f = vec2f(gx.z, gy.z);
    var g11: vec2f = vec2f(gx.w, gy.w);
    let norm = 1.79284291400159 - 0.85373472095314 *
        vec4f(dot(g00, g00), dot(g01, g01), dot(g10, g10), dot(g11, g11));
    g00 = g00 * norm.x;
    g01 = g01 * norm.y;
    g10 = g10 * norm.z;
    g11 = g11 * norm.w;
    let n00 = dot(g00, vec2f(fx.x, fy.x));
    let n10 = dot(g10, vec2f(fx.y, fy.y));
    let n01 = dot(g01, vec2f(fx.z, fy.z));
    let n11 = dot(g11, vec2f(fx.w, fy.w));
    let fade_xy = fade2(Pf.xy);
    let n_x = mix(vec2f(n00, n01), vec2f(n10, n11), vec2f(fade_xy.x));
    let n_xy = mix(n_x.x, n_x.y, fade_xy.y);
    return 2.3 * n_xy;
}
