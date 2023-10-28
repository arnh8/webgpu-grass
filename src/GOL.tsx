import { useEffect, useRef } from "react";

export default function Tortle() {
  const ref = useRef(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!navigator.gpu) {
        const e = "This browser does not support WebGPU.";
        //showVideo(e);
        throw new Error(e);
      }

      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) {
        throw new Error("No appropriate GPUAdapter found.");
      }
      const device = await adapter.requestDevice();
      console.log(adapter);
      if (!mounted) return;

      const root = document.getElementById("root");
      const canvas = document.createElement("canvas");
      canvas.id = "charles";
      canvas.height = 1200;
      canvas.width = 1200;
      root?.appendChild(canvas);

      const context = canvas.getContext("webgpu");
      if (!context) return;

      const GRID_SIZE = 256;
      // Create a uniform buffer that describes the grid.
      const uniformArray = new Float32Array([GRID_SIZE, GRID_SIZE]);
      const uniformBuffer = device.createBuffer({
        label: "Grid Uniforms",
        size: uniformArray.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      device.queue.writeBuffer(uniformBuffer, 0, uniformArray);

      //vertices for square
      const vertices = new Float32Array([
        //   X,    Y,
        -0.8, -0.8, 0.8, -0.8, 0.8, 0.8, -0.8, 0.8, -0.8, -0.8, 0.8, 0.8,
      ]);
      //create vertex buffer
      const vertexBuffer = device.createBuffer({
        label: "Cell vertices",
        size: vertices.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
      device.queue.writeBuffer(vertexBuffer, /*bufferOffset=*/ 0, vertices);
      //define vertex layout
      const vertexBufferLayout: GPUVertexBufferLayout = {
        arrayStride: 8,
        attributes: [
          {
            format: "float32x2",
            offset: 0,
            shaderLocation: 0, // This 0 corresponds to @location(0) in vertex shader
          },
        ],
      };

      // Create an array representing the active state of each cell.
      const cellStateArray = new Uint32Array(GRID_SIZE * GRID_SIZE);
      // Create a storage buffer to hold the cell state.
      const cellStateStorage = [
        device.createBuffer({
          label: "Cell State A",
          size: cellStateArray.byteLength,
          usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        }),
        device.createBuffer({
          label: "Cell State B",
          size: cellStateArray.byteLength,
          usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        }),
      ];
      // Mark every third cell of the grid as active.
      for (let i = 0; i < cellStateArray.length; i += 3) {
        cellStateArray[i] = Math.random() > 0.1 ? 1 : 0;
      }
      device.queue.writeBuffer(cellStateStorage[0], 0, cellStateArray);
      // Mark every third cell of the grid as active.
      // for (let i = 0; i < cellStateArray.length; i++) {
      //   cellStateArray[i] = 1;
      // }
      device.queue.writeBuffer(cellStateStorage[1], 0, cellStateArray);

      //Write shaders
      const cellShaderModule = device.createShaderModule({
        label: "Cell shader",
        code: `@group(0) @binding(0) var<uniform> grid: vec2f;
          @group(0) @binding(1) var<storage> cellState: array<u32>; // 
          
          struct VertexInput {
              @location(0) pos: vec2f,
              @builtin(instance_index) instance: u32,
          }
          
          struct VertexOutput {
             @builtin(position) pos: vec4f,
             @location(0) cell: vec2f
          }
          
          @vertex
          fn vertexMain(input: VertexInput) -> VertexOutput {
              let i = f32(input.instance); //cast u32 to f32
              let cell = vec2f(i % grid.x, floor(i / grid.x)); // Cell(1,1) in the image above
              let state = f32(cellState[input.instance]);
          
              let cellOffset = cell / grid * 2; // Compute the offset to cell
              let gridPos = (input.pos * state + 1) / grid - 1 + cellOffset;
              
              var output: VertexOutput;
              output.pos = vec4f(gridPos, 0, 1);
              output.cell = cell;
              return output;
          }
          
          @fragment
          fn fragmentMain(@location(0) cell: vec2f) -> @location(0) vec4f {
              let c = cell / grid;
              return vec4f(c, 1 - c.x , 1); // (Red, Green, Blue, Alpha)
          }
          
          `,
      });
      const WORKGROUP_SIZE = 8;
      // Create the compute shader that will process the simulation.
      const simulationShaderModule = device.createShaderModule({
        label: "Game of Life simulation shader",
        code: `@group(0) @binding(0) var<uniform> grid: vec2f;
          @group(0) @binding(1) var<storage> cellStateIn: array<u32>;
          @group(0) @binding(2) var<storage, read_write> cellStateOut: array<u32>;
          
          fn cellIndex(cell: vec2u) -> u32 {
            return (cell.y % u32(grid.y)) * u32(grid.x) + (cell.x % u32(grid.x));
          }
          
          fn cellActive(x: u32, y: u32) -> u32 {
            return cellStateIn[cellIndex(vec2(x, y))];
          }
          
          @compute
          @workgroup_size(${WORKGROUP_SIZE}, ${WORKGROUP_SIZE}) // New line
          fn computeMain(@builtin(global_invocation_id) cell: vec3u) {
              // Determine how many active neighbors this cell has.
            let activeNeighbors = cellActive(cell.x+1, cell.y+1) +
                                  cellActive(cell.x+1, cell.y) +
                                  cellActive(cell.x+1, cell.y-1) +
                                  cellActive(cell.x, cell.y-1) +
                                  cellActive(cell.x-1, cell.y-1) +
                                  cellActive(cell.x-1, cell.y) +
                                  cellActive(cell.x-1, cell.y+1) +
                                  cellActive(cell.x, cell.y+1);
              let i = cellIndex(cell.xy);
              switch activeNeighbors {
                  case 2: {
                    cellStateOut[i] = cellStateIn[i];
                  }
                  case 3: {
                    cellStateOut[i] = 1;
                  }
                  default: {
                    cellStateOut[i] = 0;
                  }
                }
              
          }`,
      });

      const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
      context.configure({
        device: device,
        format: canvasFormat,
      });

      // Create the bind group layout and pipeline layout.
      const bindGroupLayout = device.createBindGroupLayout({
        label: "Cell Bind Group Layout",
        entries: [
          {
            binding: 0,
            visibility:
              GPUShaderStage.VERTEX |
              GPUShaderStage.COMPUTE |
              GPUShaderStage.FRAGMENT,
            buffer: {}, // Grid uniform buffer
          },
          {
            binding: 1,
            visibility: GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE,
            buffer: { type: "read-only-storage" }, // Cell state input buffer
          },
          {
            binding: 2,
            visibility: GPUShaderStage.COMPUTE,
            buffer: { type: "storage" }, // Cell state output buffer
          },
        ],
      });

      const bindGroups = [
        device.createBindGroup({
          label: "Cell renderer bind group A",
          layout: bindGroupLayout,
          entries: [
            {
              binding: 0,
              resource: { buffer: uniformBuffer },
            },
            {
              binding: 1,
              resource: { buffer: cellStateStorage[0] },
            },
            {
              binding: 2, // cellstateOut
              resource: { buffer: cellStateStorage[1] },
            },
          ],
        }),
        device.createBindGroup({
          label: "Cell renderer bind group B",
          layout: bindGroupLayout,
          entries: [
            {
              binding: 0,
              resource: { buffer: uniformBuffer },
            },
            {
              binding: 1,
              resource: { buffer: cellStateStorage[1] },
            },
            {
              binding: 2, // New Entry
              resource: { buffer: cellStateStorage[0] },
            },
          ],
        }),
      ];

      const pipelineLayout = device.createPipelineLayout({
        label: "Cell Pipeline Layout",
        bindGroupLayouts: [bindGroupLayout],
      });

      const cellPipeline = device.createRenderPipeline({
        label: "Cell pipeline",
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
      });

      // Compute pipeline that updates the game state.
      const simulationPipeline = device.createComputePipeline({
        label: "Simulation pipeline",
        layout: pipelineLayout,
        compute: {
          module: simulationShaderModule,
          entryPoint: "computeMain",
        },
      });

      //Set up rendering loop
      const UPDATE_INTERVAL = 16; // Update every 200ms (5 times/sec)
      let step = 0; // Track how many simulation steps have been run

      function updateGrid() {
        if (!context) return;
        const encoder = device.createCommandEncoder();

        // Compute pass
        const computePass = encoder.beginComputePass();
        computePass.setPipeline(simulationPipeline);
        computePass.setBindGroup(0, bindGroups[step % 2]);
        const workgroupCount = Math.ceil(GRID_SIZE / WORKGROUP_SIZE);
        computePass.dispatchWorkgroups(workgroupCount, workgroupCount);
        computePass.end();
        step++;
        // Render pass start
        const pass = encoder.beginRenderPass({
          colorAttachments: [
            {
              view: context.getCurrentTexture().createView(),
              loadOp: "clear",
              clearValue: { r: 0.1, g: 0.2, b: 0.1, a: 1 },
              storeOp: "store",
            },
          ],
        });
        //Drawing
        pass.setPipeline(cellPipeline);
        pass.setVertexBuffer(0, vertexBuffer);
        pass.setBindGroup(0, bindGroups[step % 2]); //
        pass.draw(vertices.length / 2, GRID_SIZE * GRID_SIZE); //6 vertices
        pass.end();
        const commandBuffer = encoder.finish();

        device.queue.submit([commandBuffer]);
      }

      setInterval(updateGrid, UPDATE_INTERVAL);
    })();

    // Cleanup
    return () => {
      mounted = false;
      //device.destroy();
      const charles = document.getElementById("charles");
      console.log("charles", charles);
      charles?.remove();
    };
  }, []);

  return <div ref={ref} />;
}
