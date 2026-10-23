// REC-G descriptors extend only navigation drafts. Settled shaders/layouts are retained.
export function draftPipelineDescriptors(displayDescriptor) {
  return [
    { ...displayDescriptor, pipelineId: 'display_summary_band', entryPoint: 'display_summary_band',
      uniformLayout: { byteLength: 32, fields: [...displayDescriptor.uniformLayout.fields, { name: 'producerToken', type: 'u32', offset: 28 }] } },
    { pipelineId: 'reduce_draft_summary', kind: 'compute', sourceIds: ['draft-summary'], entryPoint: 'reduce_draft_summary', constants: {},
      bindings: [{ slot: 'u', type: 'uniform-buffer', access: 'read' }, { slot: 'draftDiagnostics', type: 'storage-buffer', access: 'read' }, { slot: 'summary', type: 'storage-buffer', access: 'read-write' }],
      uniformLayout: { byteLength: 32, fields: [{ name: 'origin', type: 'vec2<u32>', offset: 0 }, { name: 'size', type: 'vec2<u32>', offset: 8 },
        { name: 'internalSize', type: 'vec2<u32>', offset: 16 }, { name: 'diagnosticStride', type: 'u32', offset: 24 }, { name: 'producerToken', type: 'u32', offset: 28 }] } },
    { pipelineId: 'present_draft', kind: 'render', sourceIds: ['present-draft'], vertexEntryPoint: 'present_vertex', fragmentEntryPoint: 'present_fragment', constants: {},
      bindings: [{ slot: 'u', type: 'uniform-buffer', access: 'read' }, { slot: 'display', type: 'texture', access: 'read' }, { slot: 'summary', type: 'storage-buffer', access: 'read' }],
      uniformLayout: { byteLength: 32, fields: [{ name: 'internal_size', type: 'vec2<u32>', offset: 0 }, { name: 'output_size', type: 'vec2<u32>', offset: 8 },
        { name: 'producerToken', type: 'u32', offset: 16 }, { name: 'summaryWords', type: 'u32', offset: 20 }, { name: 'mode', type: 'u32', offset: 24 }] } },
  ];
}
