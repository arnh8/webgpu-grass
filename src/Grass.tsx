import { useEffect, useRef } from "react";
import grassWGSL from "./Grass.wgsl?raw";

export default function Grass() {
  const ref = useRef(null);

  useEffect(() => {
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
      root?.appendChild(canvas);
      const context = canvas.getContext("webgpu");
      if (!context) return;

      //vertices for square
      const vertices = new Float32Array([
        // X, Y, Z, R, G, B
        0.8, // Top right 0
        0.8,
        0,
        1,
        0,
        0, // Top right
        0.8, // Bottom right 1
        -0.8,
        0,
        0,
        1,
        0, // Bottom right
        -0.8, // Bottom left 2
        -0.8,
        0,
        0,
        0,
        1, // Bottom left
        -0.8, // Top left 3
        0.8,
        0,
        1,
        1,
        0.2, // Top left
        0, //Tip
        0,
        0.8,
        1,
        1,
        1,

        //0.8, 0.8, 0, 0.8, -0.8, 0, -0.8, -0.8, 0, //
        //0.8, 0.8, 0, -0.8, 0.8, 0, -0.8, -0.8, 0,
        //-0.5, -0.5, -0.3, 0.5, -0.5, -0.3, 0.5, 0.5, -0.3, -0.5, 0.5, -0.3, 0.0, 0.0, 0.5,
      ]);
      //create vertex buffer (now points)
      const vertexBuffer = device.createBuffer({
        label: "Cell vertices",
        size: vertices.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
      device.queue.writeBuffer(vertexBuffer, /*bufferOffset=*/ 0, vertices);

      //define vertex layout
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
        0, 1, 2, 0, 2, 3, 0, 1, 4, 1, 2, 4, 2, 3, 4, 3, 0, 4,
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

      // Create uniform buffer for time
      const time = new Float32Array([0]);
      const uniformBuffer = device.createBuffer({
        label: "Time uniform",
        size: 4,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      device.queue.writeBuffer(uniformBuffer, 0, time);

      // Create the bind group layout and pipeline layout.
      const bindGroupLayout = device.createBindGroupLayout({
        label: "Time Bind Group Layout",
        entries: [
          {
            binding: 0, //correspongs to binding(0) in shaders
            visibility: GPUShaderStage.VERTEX,
            //| GPUShaderStage.FRAGMENT,
            buffer: {}, // Grid uniform buffer
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
        size: [300, 150, 1],
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
      let step = 0; // Track how many simulation steps have been run

      const texture = device.createTexture({
        size: [canvas.width, canvas.height],
        sampleCount: 4,
        format: navigator.gpu.getPreferredCanvasFormat(),
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });
      const view = texture.createView();

      function updateGrid() {
        if (!context) return;
        const encoder = device.createCommandEncoder();
        step++;
        // Update uniform buffer

        time[0] = step;
        device.queue.writeBuffer(uniformBuffer, 0, time);

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
        pass.drawIndexed(indexes.length, 1, 0, 0, 0);
        //pass.draw(vertices.length / 6, 1); //6 vertices
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
  }, []);

  return <div ref={ref} />;
}
