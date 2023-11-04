import { useEffect, useRef } from "react";
import grassWGSL from "./Grass.wgsl?raw";
import grassPosWGSL from "./grassPos.wgsl?raw";
import { vec3, mat4, Mat4 } from "wgpu-matrix";
import { FolderApi, Pane } from "tweakpane";

export default function Grass() {
  const ref = useRef(null);
  useEffect(initEffect, []);
  return <div ref={ref} />;
}

type grassParameters = {
  color1: { r: number; g: number; b: number };
  color2: { r: number; g: number; b: number };
  color3: { r: number; g: number; b: number };
  color4: { r: number; g: number; b: number };
  density: number;
  xz_variance: number;
  y_variance: number;
  y_height: number;
  scale: number;
  x: number;
  y: number;
  z: number;
};

function buildVertices(params: grassParameters) {
  return new Float32Array([
    // X, Y, Z, R, G, B
    0, // Vertex 0 Tip
    0.9,
    0,
    params.color1.r / 255,
    params.color1.g / 255,
    params.color1.b / 255,
    0.03, // Vertex 1 R1
    0.7,
    0,
    params.color2.r / 255,
    params.color2.g / 255,
    params.color2.b / 255,
    0.05, // Vertex 2 R2
    0.4,
    0,
    params.color3.r / 255,
    params.color3.g / 255,
    params.color3.b / 255,
    0.055, // Vertex 3 R3
    0,
    0,
    params.color4.r / 255,
    params.color4.g / 255,
    params.color4.b / 255,
    -0.055, // Vertex 4 L3
    0,
    0,
    params.color4.r / 255,
    params.color4.g / 255,
    params.color4.b / 255,
    -0.05, // Vertex 5 L2
    0.4,
    0,
    params.color3.r / 255,
    params.color3.g / 255,
    params.color3.b / 255,
    -0.03, // Vertex 6 L1
    0.7,
    0,
    params.color2.r / 255,
    params.color2.g / 255,
    params.color2.b / 255,
  ]);
}

function initEffect() {
  let mounted = true;
  (async () => {
    if (!navigator.gpu) {
      const e = "This browser does not support WebGPU.";
      throw new Error(e);
    }
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      throw new Error("No appropriate GPUAdapter found.");
    }
    const device = await adapter.requestDevice();
    if (!mounted) return;
    const root = document.getElementById("root");
    const canvas = document.createElement("canvas");
    canvas.id = "grassCanvas";
    canvas.width = 700;
    canvas.height = 700;
    root?.appendChild(canvas);
    const context = canvas.getContext("webgpu");
    if (!context) return;
    // Manage gui
    const guiWrapper = document.createElement("div");
    root?.appendChild(guiWrapper);

    const PARAMS = {
      color1: { r: 243, g: 253, b: 214 },
      color2: { r: 166, g: 209, b: 161 },
      color3: { r: 90, g: 182, b: 136 },
      color4: { r: 24, g: 146, b: 157 },
      density: 10,
      xz_variance: 1.7,
      y_variance: 0.25,
      y_height: 0.65,
      scale: 1.0,
      x: 1.0,
      y: 1.0,
      z: 1.0,
    };

    const pane = initTweakPane(PARAMS, guiWrapper);

    // Create storage buffer for grass positions
    const grassBladeCount = 40000; // Dispatch groups (x * y * z) * threads (x * y * z),
    // Example: 4 * 1 * 4 * 16 * 1 * 16 = 4096 blades
    const grassPositionsStorage = device.createBuffer({
      label: "Grass positions",
      size: 4 * grassBladeCount * 4, //4 bytes * 16 blades of grass * 4 floats per blade of grass (x,y,z,padding)
      usage:
        GPUBufferUsage.STORAGE |
        GPUBufferUsage.COPY_DST |
        GPUBufferUsage.COPY_SRC,
    });

    const computeUniforms = {
      // Size and offset (in floats) of uniform data within
      // the uniform buffer and in computeUniformData array.
      density: { size: 1, offset: 0 },
      xz_variance: { size: 1, offset: 1 },
      y_variance: { size: 1, offset: 2 },
      y_height: { size: 1, offset: 3 },
    };

    const computeUniformData = new Float32Array(4);
    const computeUniformBuffer = device.createBuffer({
      label: "My uniforms",
      size: 4 * computeUniformData.length, // 4 bytes * ...
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Create a compute shader that generates mat4x4s of grass positions
    // and puts it in grasspositionsstorage
    const grassPosShaderModule = device.createShaderModule({
      label: "GrassPos Compute Shader",
      code: grassPosWGSL,
    });

    const computeBindGroupLayout = device.createBindGroupLayout({
      label: "Grasspos Compute BG Layout",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "storage" },
        },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: {} },
      ],
    });

    const computeBindGroup = device.createBindGroup({
      label: "Compute Bind Group",
      layout: computeBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: grassPositionsStorage } },
        { binding: 1, resource: { buffer: computeUniformBuffer } },
      ],
    });

    const computePipelineLayout = device.createPipelineLayout({
      label: "Compute Pipeline Layout",
      bindGroupLayouts: [computeBindGroupLayout],
    });

    const computePipeline = device.createComputePipeline({
      label: "GrassPos pipeline",
      layout: computePipelineLayout,
      compute: { module: grassPosShaderModule, entryPoint: "computeMain" },
    });

    // Run compute pass
    function runComputePass() {
      // Update uniforms with parameters
      computeUniformData[0] = PARAMS.density;
      computeUniformData[1] = PARAMS.xz_variance;
      computeUniformData[2] = PARAMS.y_variance;
      computeUniformData[3] = PARAMS.y_height;
      device.queue.writeBuffer(computeUniformBuffer, 0, computeUniformData);
      // Run compute pass
      const encoder = device.createCommandEncoder({
        label: "doubling encoder",
      });
      const pass = encoder.beginComputePass({
        label: "doubling compute pass",
      });
      pass.setPipeline(computePipeline);
      pass.setBindGroup(0, computeBindGroup);
      pass.dispatchWorkgroups(12, 1, 18); // How many times to run the compute shader?
      pass.end();
      device.queue.submit([encoder.finish()]);
    }

    runComputePass();
    const cFolder: FolderApi = pane.children[1] as FolderApi;
    cFolder.on("change", () => {
      console.log("wah");
      runComputePass();
    });

    const colors = [
      { r: 243 / 255, g: 253 / 255, b: 214 / 255 },
      { r: 166 / 255, g: 209 / 255, b: 161 / 255 },
      { r: 90 / 255, g: 182 / 255, b: 136 / 255 },
      { r: 24 / 255, g: 146 / 255, b: 157 / 255 },
      //{ r: 91 / 255, g: 193 / 255, b: 39 / 255 },
      //{ r: 70 / 255, g: 147 / 255, b: 30 / 255 },
      //{ r: 51 / 255, g: 107 / 255, b: 21 / 255 },
      //{ r: 31 / 255, g: 65 / 255, b: 13 / 255 },
      //{ r: 178 / 255, g: 175 / 255, b: 255 / 255 },
      //{ r: 97 / 255, g: 87 / 255, b: 180 / 255 },
      //{ r: 63 / 255, g: 24 / 255, b: 158 / 255 },
      //{ r: 25 / 255, g: 0 / 255, b: 76 / 255 },
    ];

    // Vertices for grass
    const vertices = buildVertices(PARAMS);
    // create vertex buffer (now points)
    const vertexBuffer = device.createBuffer({
      label: "Cell vertices",
      size: vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(vertexBuffer, /*bufferOffset=*/ 0, vertices);

    function updateVerts() {
      // Vertices for grass
      const vertices = buildVertices(PARAMS);
      device.queue.writeBuffer(vertexBuffer, /*bufferOffset=*/ 0, vertices);
    }
    pane.on("change", (ev) => {
      if (ev.last) {
        console.log("Updating verts");
        updateVerts();
      }
    });

    // define vertex layout
    const vertexBufferLayout: GPUVertexBufferLayout = {
      arrayStride: 24, //1 32float = 4 bytes, 3 floats is 12
      attributes: [
        {
          format: "float32x3",
          offset: 0,
          shaderLocation: 0, // This 0 corresponds to @location(0) in vertex shader
        },
        {
          format: "float32x3",
          offset: 12,
          shaderLocation: 1, // This 1 corresponds to @location(1) in vertex shader
        },
      ],
      //stepMode: "vertex",
    };

    const indexes = new Uint32Array([
      0, 1, 6, 1, 5, 6, 1, 2, 5, 2, 4, 5, 2, 3, 4,
    ]);
    const indexBuffer = device.createBuffer({
      label: "Vertex indexes",
      size: indexes.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(indexBuffer, /*bufferOffset=*/ 0, indexes);

    //Write shaders
    const cellShaderModule = device.createShaderModule({
      label: "Cell shader",
      code: grassWGSL,
    });

    const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
      device: device,
      format: canvasFormat,
    });

    // Create uniform buffer for everything
    const time = new Float32Array([0]);
    const PI = 3.14159265358979323846;

    // MODEL TRANSFORM
    // Scaling Matrix
    const scale = 2.0;
    const S = mat4.scaling(vec3.create(scale, scale, scale));
    // Translate Object
    const T1 = mat4.translation(vec3.create(0.0, 0.0, 0.0)); //

    // Rotate object
    let angle1 = time[0];
    let c1 = Math.cos(angle1);
    let s1 = Math.sin(angle1);
    const R1 = mat4.create(
      c1,
      s1,
      0.0,
      0.0,
      -s1,
      c1,
      0.0,
      0.0,
      0.0,
      0.0,
      1.0,
      0.0,
      0.0,
      0.0,
      0.0,
      1.0
    );
    mat4.transpose(R1, R1);
    //R1 * T1 * S
    const modelMatrix = mat4.mul(mat4.mul(R1, T1), S);
    //mat4.transpose(modelMatrix, modelMatrix);
    const TA = mat4.translation(vec3.create(0.0, 0.0, -1.0));

    // VIEW TRANSFORM
    const focalPoint = vec3.create(0.0, 0.0, -5.0);
    const T2 = mat4.translation(focalPoint);

    // Rotate viewpoint
    const viewRotation = mat4.axisRotation(vec3.create(1, 0, 0), PI / 6);
    //const viewMatrix = mat4.mul(T2, R2); // T2 * R2
    const viewMatrix = mat4.mul(T2, viewRotation); // T2 * R2

    // PROJECTION
    const aspectRatio = 1;
    const near = 0.01;
    const far = 100.0;
    const fov = PI / 2;
    const projectionMatrix = mat4.perspective(fov, aspectRatio, near, far);

    const uniforms = {
      // Size and offset (in floats) of uniform data within
      // the uniform buffer and in uniformData array.
      projection: { size: 16, offset: 0 },
      view: { size: 16, offset: 16 },
      modelview: { size: 16, offset: 32 },
      time: { size: 1, offset: 48 },
    };

    const uniformData = new Float32Array(52); // 16+16+16+1(technically 4) = 52
    uniformData.set(projectionMatrix, 0);
    uniformData.set(viewMatrix, 16);
    uniformData.set(modelMatrix, 32);
    uniformData[48] = time[0];

    // Pmatrix is 16 f32s, so thats 4 bytes * 16, = 64 bytes
    // Vmatrix is 64 bytes, and so is modelmatrix, time is 1 f32 aka 4 bytes
    const uniformBuffer = device.createBuffer({
      label: "My uniforms",
      size: 4 * uniformData.length, // 4 bytes * 52
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(uniformBuffer, 0, uniformData);

    // Create the bind group layout and pipeline layout.
    const bindGroupLayout = device.createBindGroupLayout({
      label: "Time Bind Group Layout",
      entries: [
        {
          binding: 0, // orresponds to binding(0) in shaders
          visibility: GPUShaderStage.COMPUTE | GPUShaderStage.VERTEX,
          //| GPUShaderStage.FRAGMENT,
          buffer: {}, // Grid uniform buffer
        },
        {
          binding: 1, // orresponds to binding(0) in shaders
          visibility: GPUShaderStage.COMPUTE | GPUShaderStage.VERTEX,
          //| GPUShaderStage.FRAGMENT,
          buffer: { type: "read-only-storage" }, // Grid uniform buffer
        },
      ],
    });

    const bindGroup = device.createBindGroup({
      label: "Bind group A",
      layout: bindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: { buffer: uniformBuffer },
        },
        {
          binding: 1,
          resource: { buffer: grassPositionsStorage },
        },
      ],
    });

    const pipelineLayout = device.createPipelineLayout({
      label: "Grass Pipeline Layout",
      bindGroupLayouts: [bindGroupLayout],
    });

    const depthTextureFormat = "depth24plus";
    const grassPipeline = device.createRenderPipeline({
      label: "Grass pipeline",
      layout: pipelineLayout,
      vertex: {
        module: cellShaderModule,
        entryPoint: "vertexMain",
        buffers: [vertexBufferLayout],
      },
      fragment: {
        module: cellShaderModule,
        entryPoint: "fragmentMain",
        targets: [
          {
            format: canvasFormat,
          },
        ],
      },
      depthStencil: {
        format: depthTextureFormat,
        depthCompare: "less",
        depthWriteEnabled: true,
        stencilReadMask: 0,
        stencilWriteMask: 0,
      },
    });

    const depthTexture = device.createTexture({
      dimension: "2d",
      format: depthTextureFormat,
      mipLevelCount: 1,
      sampleCount: 1,
      size: [canvas.width, canvas.height, 1],
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
      viewFormats: [depthTextureFormat],
    });

    const depthTextureView = depthTexture.createView({
      aspect: "depth-only",
      baseArrayLayer: 0,
      arrayLayerCount: 1,
      baseMipLevel: 0,
      mipLevelCount: 1,
      dimension: "2d",
      format: depthTextureFormat,
    });

    //Set up rendering loop
    const UPDATE_INTERVAL = 16; // Update every 200ms (5 times/sec)
    let step = 0; // Track how many loops have been run
    function updateGrid() {
      if (!context) return;
      const encoder = device.createCommandEncoder();
      step++;
      // Update uniform buffer
      // Updating time
      time[0] = step;
      device.queue.writeBuffer(
        uniformBuffer,
        uniforms["time"].offset * 4,
        time,
        0,
        uniforms["time"].size
      );
      // Updating view
      //mat4.rotate(R1, vec3.create(0, 1, 0), -PI / 1200, R1);
      mat4.mul(mat4.mul(R1, T1), S, modelMatrix); //modelmatrix = R1 * T1 * S
      mat4.mul(TA, modelMatrix, modelMatrix);
      uniformData.set(modelMatrix, 32);
      device.queue.writeBuffer(
        uniformBuffer,
        uniforms["modelview"].offset * 4,
        uniformData,
        32,
        uniforms["modelview"].size
      );
      // Render pass start
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: context.getCurrentTexture().createView(),
            loadOp: "clear",
            clearValue: { r: 0.1, g: 0.1, b: 0.1, a: 1 },
            storeOp: "store",
          },
        ],
        depthStencilAttachment: {
          view: depthTextureView,
          depthClearValue: 1, // The initial value of the depth buffer, meaning "far"
          depthLoadOp: "clear",
          depthStoreOp: "store",
          depthReadOnly: false,
          stencilClearValue: 0,
          stencilLoadOp: undefined,
          stencilStoreOp: undefined,
          stencilReadOnly: true,
        },
      });
      //Drawing
      pass.setPipeline(grassPipeline);
      pass.setVertexBuffer(0, vertexBuffer);
      pass.setBindGroup(0, bindGroup); //
      pass.setIndexBuffer(indexBuffer, "uint32", 0);
      pass.drawIndexed(indexes.length, grassBladeCount, 0, 0, 0); // second arg is instances to draw
      pass.end();
      const commandBuffer = encoder.finish();

      device.queue.submit([commandBuffer]);
    }
    //updateGrid();
    setInterval(updateGrid, UPDATE_INTERVAL);
  })();

  // Cleanup
  return () => {
    mounted = false;
  };
}

function printMat4(mat: Mat4) {
  for (let i = 0; i < 16; i += 4) {
    console.log(`${mat[i]}, ${mat[i + 1]}, ${mat[2 + i]}, ${mat[3 + i]}`);
  }
}

function initTweakPane(params: grassParameters, div: HTMLDivElement) {
  const pane = new Pane({ title: "Parameters", container: div });
  const f1 = pane.addFolder({
    title: "Colors",
  });
  f1.addBinding(params, "color1");
  f1.addBinding(params, "color2");
  f1.addBinding(params, "color3");
  f1.addBinding(params, "color4");

  const f2 = pane.addFolder({
    title: "Compute parameters",
  });
  f2.addBinding(params, "density", { view: "slider", min: 2, max: 14 });
  f2.addBinding(params, "xz_variance", { view: "slider", min: -2, max: 2 });
  f2.addBinding(params, "y_variance", { view: "slider", min: 0, max: 1.5 });
  f2.addBinding(params, "y_height", { view: "slider", min: 0, max: 2 });

  const f3 = pane.addFolder({
    title: "View",
  });
  f3.addBinding(params, "scale", { view: "slider", min: 0.01, max: 3 });
  f3.addBinding(params, "x", { view: "slider", min: -2, max: 2 });
  f3.addBinding(params, "y", { view: "slider", min: -2, max: 2 });
  f3.addBinding(params, "z", { view: "slider", min: -2, max: 2 });

  return pane;
}
