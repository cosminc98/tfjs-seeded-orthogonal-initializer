/**
 * @license
 * Copyright 2022 Google LLC.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */

import {MaxPoolWithArgmax, MaxPoolWithArgmaxAttrs, MaxPoolWithArgmaxInputs} from '@tensorflow/tfjs-core';
import {backend_util, KernelConfig, KernelFunc, TensorInfo, util} from '@tensorflow/tfjs-core';

import {WebGPUBackend} from '../backend_webgpu';
import {Pool2DProgram} from '../pool2d_webgpu';

export function maxPoolWithArgmax(args: {
  inputs: MaxPoolWithArgmaxInputs,
  attrs: MaxPoolWithArgmaxAttrs,
  backend: WebGPUBackend
}): TensorInfo[] {
  const {inputs, backend, attrs} = args;
  const {filterSize, strides, pad, includeBatchInIndex} = attrs;
  const {x} = inputs;

  util.assert(
      x.shape.length === 4,
      () => `Error in maxPool: input must be rank 4 but got rank ${
          x.shape.length}.`);
  const dilations: [number, number] = [1, 1];
  util.assert(
      backend_util.eitherStridesOrDilationsAreOne(strides, dilations),
      () => 'Error in maxPool: Either strides or dilations must be 1. ' +
          `Got strides ${strides} and dilations '${dilations}'`);

  const convInfo = backend_util.computePool2DInfo(
      x.shape as [number, number, number, number], filterSize, strides,
      dilations, pad);

  const uniformData = [
    {type: 'int32', data: [convInfo.strideHeight, convInfo.strideWidth]},
    {type: 'int32', data: [convInfo.padInfo.top, convInfo.padInfo.left]},
    {type: 'int32', data: [convInfo.dilationHeight, convInfo.dilationWidth]},
    {type: 'int32', data: [convInfo.inHeight, convInfo.inWidth]}, {
      type: 'int32',
      data: [convInfo.effectiveFilterHeight, convInfo.effectiveFilterWidth]
    }
  ];
  let program = new Pool2DProgram(convInfo, 'max', false);
  const poolOutput =
      backend.runWebGPUProgram(program, [x], x.dtype, uniformData);

  program = new Pool2DProgram(convInfo, 'max', true, true, includeBatchInIndex);
  const indexOutput =
      backend.runWebGPUProgram(program, [x], 'int32', uniformData);
  return [poolOutput, indexOutput];
}

export const maxPoolWithArgmaxConfig: KernelConfig = {
  kernelName: MaxPoolWithArgmax,
  backendName: 'webgpu',
  kernelFunc: maxPoolWithArgmax as unknown as KernelFunc
};
