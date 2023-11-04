struct computeUniforms {
    udensity: f32,
    uxz_variance: f32,
    uy_variance: f32,
    uy_height: f32,
}

@group(0) @binding(0) var<storage, read_write> grassPositions: array<vec3<f32>>;
@group(0) @binding(1) var<uniform> cUniforms: computeUniforms;

const WG_SIZE_X = 8;
const WG_SIZE_Y = 1;
const WG_SIZE_Z = 8; 
const numThreadsPerWorkgroup = WG_SIZE_X * WG_SIZE_Z;

const OFFSET = 3.5;
const DENSITY = 12.1;
const XZVARIANCE = 0.7;
const YVARIANCE = 0.25;
const YHEIGHT = 0.65;

@compute
@workgroup_size(WG_SIZE_X, WG_SIZE_Y, WG_SIZE_Z) 
fn computeMain(
    @builtin(local_invocation_id) local_invocation_id: vec3<u32>, 
    @builtin(workgroup_id) workgroup_id: vec3<u32>,
    @builtin(num_workgroups) num_workgroups: vec3<u32>,
    @builtin(local_invocation_index) local_invocation_index: u32,
){
    let workgroup_index =  
        workgroup_id.x +
        workgroup_id.y * num_workgroups.x +
        workgroup_id.z * num_workgroups.x * num_workgroups.y;

    let global_invocation_index =
        workgroup_index * numThreadsPerWorkgroup +
        local_invocation_index;

    var xPos = f32(local_invocation_id.x + workgroup_id.x * WG_SIZE_X);
    var zPos = f32(local_invocation_id.z + workgroup_id.z * WG_SIZE_Z);
    xPos = xPos / cUniforms.udensity - OFFSET - 0.0;
    zPos = zPos / cUniforms.udensity - OFFSET - 5.8;

    let simplexHash = simplexNoise2(vec2f(xPos, zPos));

    let yPos = simplexHash * cUniforms.uy_variance + cUniforms.uy_height;
    xPos = xPos + cUniforms.uxz_variance * simplexHash;
    zPos = zPos + cUniforms.uxz_variance * simplexHash;
    grassPositions[global_invocation_index] = vec3f(xPos, yPos, zPos);
}

// https://gist.github.com/munrocket/236ed5ba7e409b8bdf1ff6eca5dcdc39
//  MIT License. © Ian McEwan, Stefan Gustavson, Munrocket, Johan Helsing
//
fn mod289(x: vec2f) -> vec2f {
    return x - floor(x * (1. / 289.)) * 289.;
}

fn mod289_3(x: vec3f) -> vec3f {
    return x - floor(x * (1. / 289.)) * 289.;
}

fn permute3(x: vec3f) -> vec3f {
    return mod289_3(((x * 34.) + 1.) * x);
}

//  MIT License. © Ian McEwan, Stefan Gustavson, Munrocket
fn simplexNoise2(v: vec2f) -> f32 {
    let C = vec4(
        0.211324865405187, // (3.0-sqrt(3.0))/6.0
        0.366025403784439, // 0.5*(sqrt(3.0)-1.0)
        -0.577350269189626, // -1.0 + 2.0 * C.x
        0.024390243902439 // 1.0 / 41.0
    );

    // First corner
    var i = floor(v + dot(v, C.yy));
    let x0 = v - i + dot(i, C.xx);

    // Other corners
    var i1 = select(vec2(0., 1.), vec2(1., 0.), x0.x > x0.y);

    // x0 = x0 - 0.0 + 0.0 * C.xx ;
    // x1 = x0 - i1 + 1.0 * C.xx ;
    // x2 = x0 - 1.0 + 2.0 * C.xx ;
    var x12 = x0.xyxy + C.xxzz;
    x12.x = x12.x - i1.x;
    x12.y = x12.y - i1.y;

    // Permutations
    i = mod289(i); // Avoid truncation effects in permutation

    var p = permute3(permute3(i.y + vec3(0., i1.y, 1.)) + i.x + vec3(0., i1.x, 1.));
    var m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), vec3(0.));
    m *= m;
    m *= m;

    // Gradients: 41 points uniformly over a line, mapped onto a diamond.
    // The ring size 17*17 = 289 is close to a multiple of 41 (41*7 = 287)
    let x = 2. * fract(p * C.www) - 1.;
    let h = abs(x) - 0.5;
    let ox = floor(x + 0.5);
    let a0 = x - ox;

    // Normalize gradients implicitly by scaling m
    // Approximation of: m *= inversesqrt( a0*a0 + h*h );
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);

    // Compute final noise value at P
    let g = vec3(a0.x * x0.x + h.x * x0.y, a0.yz * x12.xz + h.yz * x12.yw);
    return 130. * dot(m, g);
}

