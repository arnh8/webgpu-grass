@group(0) @binding(0) var<storage, read_write> grassPositions: array<vec3<u32>, 64>;

const WG_SIZE_X = 8;
const WG_SIZE_Y = 1;
const WG_SIZE_Z = 8; // basically 0? or 1

@compute
@workgroup_size(4,1,4) 
fn computeMain(@builtin(global_invocation_id) blade: vec3<u32>) {
    // get the id of your blade of grass
    // calculate its position based on the id
    // put it in mat4x4 and write it back into the storage buffer
    let id = blade.x + blade.y + blade.z * 4; //this is wrong, theres multipliers that need to be accounted
   
    grassPositions[id] = blade;
}