import { useEffect, useRef } from "react";
import grassWGSL from "./Grass.wgsl?raw";
import grassPosWGSL from "./grassPos.wgsl?raw";
import { vec3, mat4 } from "wgpu-matrix";
import { FolderApi, Pane } from "tweakpane";

export default function Grass() {
  const ref = useRef(null);
  useEffect(initEffect, []);
  return <div ref={ref} id="grassDiv" />;
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
  x_rotation: number;
  y_rotation: number;
  z_rotation: number;
  auto_rotate: boolean;
  orthographic_perspective: boolean;
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
      const root = document.getElementById("root");
      const p = document.createElement("p");
      p.innerText = "This browser doesn't support WebGPU";
      root?.appendChild(p);
      const e = "This browser does not support WebGPU.";
      throw new Error(e);
    }
    try {
      await navigator.gpu.requestAdapter();
    } catch (error) {
      const root = document.getElementById("root");
      const p = document.createElement("p");
      p.innerText =
        "Could not request GPUAdapter. Does this browser support WebGPU?";
      root?.appendChild(p);
      return;
    }
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      throw new Error("No appropriate GPUAdapter found.");
    }
    const device = await adapter.requestDevice();
    if (!mounted) return;
    const root = document.getElementById("grassDiv");
    const canvas = document.createElement("canvas");
    canvas.id = "grassCanvas";
    canvas.width = 1000;
    canvas.height = 700;
    root?.appendChild(canvas);
    const context = canvas.getContext("webgpu");
    if (!context) return;
    // Manage gui
    const guiWrapper = document.createElement("div");
    root?.appendChild(guiWrapper);

    const PARAMS = {
      color1: { r: 69, g: 134, b: 54 },
      color2: { r: 67, g: 121, b: 61 },
      color3: { r: 46, g: 89, b: 67 },
      color4: { r: 32, g: 78, b: 83 },
      density: 10,
      xz_variance: 1.7,
      y_variance: 0.4,
      y_height: 1.3,
      scale: 1.0,
      x: 0.0,
      y: 0.0,
      z: -5.0,
      x_rotation: 24,
      y_rotation: 0,
      z_rotation: 0,
      orthographic_perspective: false,
      auto_rotate: false,
    };
    /*
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
    */

    const pane = initTweakPane(PARAMS, guiWrapper);

    // Create storage buffer for grass positions
    const DISPATCH_X = 16;
    const DISPATCH_Z = 16;
    const grassBladeCount = DISPATCH_X * DISPATCH_Z * 64; // Dispatch groups (x * y * z) * threads (x * y * z),
    // Example: 16 * 1 * 16 * 8 * 1 * 8 = 16384 blades
    const grassPositionsStorage = device.createBuffer({
      label: "Grass positions",
      size: 4 * grassBladeCount * 4, //4 bytes * 16 blades of grass * 4 floats per blade of grass (x,y,z,padding)
      usage:
        GPUBufferUsage.STORAGE |
        GPUBufferUsage.COPY_DST |
        GPUBufferUsage.COPY_SRC,
    });

    /*
    const computeUniforms = {
      // Size and offset (in floats) of uniform data within
      // the uniform buffer and in computeUniformData array.
      density: { size: 1, offset: 0 },
      xz_variance: { size: 1, offset: 1 },
      y_variance: { size: 1, offset: 2 },
      y_height: { size: 1, offset: 3 },
    };
    */

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
      pass.dispatchWorkgroups(DISPATCH_X, 1, DISPATCH_Z); // How many times to run the compute shader?
      // todo: tweakpane dispatch groups
      pass.end();
      device.queue.submit([encoder.finish()]);
    }
    runComputePass();

    const cFolder: FolderApi = pane.children[1] as FolderApi;
    cFolder.on("change", () => {
      runComputePass();
    });

    // Vertices for grass
    let vertices = buildVertices(PARAMS);
    const vertexBuffer = device.createBuffer({
      label: "Cell vertices",
      size: vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(vertexBuffer, /*bufferOffset=*/ 0, vertices);

    function updateVerts() {
      vertices = buildVertices(PARAMS);
      device.queue.writeBuffer(vertexBuffer, /*bufferOffset=*/ 0, vertices);
    }

    const colorFolder: FolderApi = pane.children[0] as FolderApi;
    colorFolder.on("change", (ev) => {
      if (ev.last) {
        updateVerts();
      }
    });

    // Define vertex layout
    const vertexBufferLayout: GPUVertexBufferLayout = {
      arrayStride: 24, //1 32float = 4 bytes, 3 floats is 12
      attributes: [
        {
          format: "float32x3", // 3 floats per vertex
          offset: 0,
          shaderLocation: 0, // This 0 corresponds to @location(0) in vertex shader
        },
        {
          format: "float32x3", // 3 floats for color
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

    const cellShaderModule = device.createShaderModule({
      label: "Grass Shader",
      code: grassWGSL,
    });

    const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
      device: device,
      format: canvasFormat,
    });

    // Create uniform buffer for everything
    const time = new Float32Array([0.0]);

    // MODEL TRANSFORM
    const S = mat4.scaling(
      vec3.create(PARAMS.scale, PARAMS.scale, PARAMS.scale)
    );
    const T1 = mat4.translation(vec3.create(0.0, 0.0, 0.0)); //
    const R1 = mat4.rotation(vec3.create(0, 0, 1), 0);
    // Model transform = Rotation * Translation * Scale
    const modelMatrix = mat4.mul(mat4.mul(R1, T1), S);

    // VIEW TRANSFORM
    const viewTranslation = mat4.translation(
      vec3.create(PARAMS.x, PARAMS.y, PARAMS.z)
    );
    const viewRotation = mat4.axisRotation(
      vec3.create(1, 0, 0),
      (PARAMS.x_rotation * Math.PI) / 180
    );
    const viewMatrix = mat4.mul(viewTranslation, viewRotation); // T2 * R2

    // PROJECTION
    const aspectRatio = canvas.width / canvas.height;
    const near = 0.01;
    const far = 100.0;
    const fov = Math.PI / 2;
    const projectionMatrix = mat4.perspective(fov, aspectRatio, near, far);
    const orthprojectionMatrix = mat4.ortho(-1, 1, -1, 1, near, far);

    const uStructure = {
      // Size (in floats) and offset (in floats * 4bytes) of uniform data
      // in the uniform buffer and in uniformData array.
      projection: { SIZE: 16, OFF: 0 * 4 }, //16 f32s for a 4x4mat
      view: { SIZE: 16, OFF: 16 * 4 },
      modelview: { SIZE: 16, OFF: 32 * 4 },
      time: { SIZE: 1, OFF: 48 * 4 },
    };

    const uniformData = new Float32Array(52); // 16+16+16+1(technically 4) = 52
    uniformData.set(projectionMatrix, 0);
    uniformData.set(viewMatrix, 16);
    uniformData.set(modelMatrix, 32);
    uniformData[48] = time[0];

    const uniformBuffer = device.createBuffer({
      label: "My uniforms",
      size: 4 * uniformData.length, // 4 bytes * 52
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(uniformBuffer, 0, uniformData);

    function updateModel() {
      const S = mat4.scaling(
        vec3.create(PARAMS.scale, PARAMS.scale, PARAMS.scale)
      );
      const T1 = mat4.translation(vec3.create(0.0, 0.0, 0.0)); //
      const R1 = mat4.rotation(vec3.create(0, 0, 1), 0);
      // Model transform = Rotation * Translation * Scale
      const modelMatrix = mat4.mul(mat4.mul(R1, T1), S);
      uniformData.set(modelMatrix, 32);
      device.queue.writeBuffer(uniformBuffer, 0, uniformData); // todo: write to this properly
    }

    const modelFolder: FolderApi = pane.children[2] as FolderApi;
    modelFolder.on("change", () => {
      updateModel();
    });

    function updateView() {
      const translate = mat4.translation(
        vec3.create(PARAMS.x, PARAMS.y, PARAMS.z)
      );
      const xRotation = mat4.axisRotation(
        vec3.create(1, 0, 0),
        (PARAMS.x_rotation / 180) * Math.PI
      );
      const yRotation = mat4.axisRotation(
        vec3.create(0, 1, 0),
        (PARAMS.y_rotation / 180) * Math.PI
      );
      const zRotation = mat4.axisRotation(
        vec3.create(0, 0, 1),
        (PARAMS.z_rotation / 180) * Math.PI
      );
      const tempVMatrix = mat4.mul(translate, xRotation);
      mat4.mul(tempVMatrix, yRotation, tempVMatrix);
      mat4.mul(tempVMatrix, zRotation, viewMatrix); // todo: dangerous setting viewMatrix here
      uniformData.set(viewMatrix, 16);
      device.queue.writeBuffer(uniformBuffer, 0, uniformData); // todo: write to this properly
    }

    const viewFolder: FolderApi = pane.children[3] as FolderApi;
    viewFolder.on("change", () => {
      updateView();
    });

    function updateProjection() {
      if (PARAMS.orthographic_perspective) {
        uniformData.set(orthprojectionMatrix, 0);
      } else {
        uniformData.set(projectionMatrix, 0);
      }
      device.queue.writeBuffer(uniformBuffer, 0, uniformData);
    }

    const projFolder: FolderApi = pane.children[4] as FolderApi;
    projFolder.on("change", () => {
      updateProjection();
    });

    // Create the bind group layout and pipeline layout.
    const bindGroupLayout = device.createBindGroupLayout({
      label: "Time Bind Group Layout",
      entries: [
        {
          binding: 0, // corresponds to binding(0) in shaders
          visibility: GPUShaderStage.COMPUTE | GPUShaderStage.VERTEX,
          buffer: {}, // uniform buffer
        },
        {
          binding: 1, // corresponds to binding(1) in shaders
          visibility: GPUShaderStage.COMPUTE | GPUShaderStage.VERTEX,
          buffer: { type: "read-only-storage" }, // Grass pos buffer
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

    const fps = document.createElement("p");
    fps.id = "fps";
    fps.innerText = "0";
    root?.appendChild(fps);

    //Set up rendering loop
    let lastTime: number = performance.now();
    function renderFrame(timestamp: DOMHighResTimeStamp) {
      if (!context) return;
      // Updating time
      const dt = timestamp - lastTime;
      lastTime = timestamp;
      time[0] += dt * 0.001;
      device.queue.writeBuffer(
        uniformBuffer,
        uStructure.time.OFF,
        time,
        0,
        uStructure.time.SIZE
      );

      fps.innerText = `FPS: ${Math.ceil(1000 / dt)}`;
      // todo? https://stackoverflow.com/questions/4787431/how-do-i-check-framerate-in-javascript

      if (PARAMS.auto_rotate) {
        mat4.rotate(viewMatrix, vec3.create(0, 1, 0), dt * 0.0001, viewMatrix);
        uniformData.set(viewMatrix, 16);
        device.queue.writeBuffer(
          uniformBuffer,
          uStructure.view.OFF,
          uniformData,
          16,
          uStructure.view.SIZE
        );
      }

      // Render pass start
      const encoder = device.createCommandEncoder();
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

      device.queue.submit([encoder.finish()]);
      requestAnimationFrame(renderFrame);
    }
    requestAnimationFrame(renderFrame);
  })();

  // Cleanup
  return () => {
    mounted = false;
  };
}

//function printMat4(mat: Mat4) {
//  for (let i = 0; i < 16; i += 4) {
//    console.log(`${mat[i]}, ${mat[i + 1]}, ${mat[2 + i]}, ${mat[3 + i]}`);
//  }
//}

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
    title: "Model",
  });
  f3.addBinding(params, "scale", { view: "slider", min: 0.01, max: 3 });

  const f4 = pane.addFolder({
    title: "View",
  });
  f4.addBinding(params, "x", { view: "slider", min: -5, max: 5 });
  f4.addBinding(params, "y", { view: "slider", min: -3, max: 3 });
  f4.addBinding(params, "z", { view: "slider", min: -10, max: 10 });
  f4.addBinding(params, "x_rotation", { view: "slider", min: 0, max: 360 });
  f4.addBinding(params, "y_rotation", { view: "slider", min: 0, max: 360 });
  f4.addBinding(params, "z_rotation", { view: "slider", min: 0, max: 360 });
  f4.addBinding(params, "auto_rotate", { view: "boolean" });

  const f5 = pane.addFolder({
    title: "Projection",
  });
  f5.addBinding(params, "orthographic_perspective", { view: "boolean" });

  return pane;
}
