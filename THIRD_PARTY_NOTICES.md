# Third-party notices

Dependency versions are pinned in `package-lock.json` and the runtime lock files. Broader asset and runtime provenance is maintained in [ASSET_PROVENANCE](docs/ASSET_PROVENANCE.md). Distribution includes the applicable original license files.

## Local speech input

| Component | Source and license |
| --- | --- |
| SenseVoiceSmall model, INT8 export | Alibaba Group / FunAudioLLM; exact export revision and SHA-256 in [speech lock](runtime/speech/lock.json). [FunASR Model Open Source License Agreement 1.1](licenses/SenseVoice-model-FunASR-1.1.txt). The model license is separate from the upstream project's source-code license. |
| sherpa-onnx 2.0.1 | [k2-fsa/sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx), [Apache-2.0](licenses/sherpa-onnx-Apache-2.0.txt). The Windows package includes native inference libraries and their embedded notices. |
| Speech runtime's ONNX Runtime 1.28.2 | Microsoft; [MIT](licenses/ONNXRuntime-speech-MIT.txt) and [original third-party notices](licenses/ONNXRuntime-speech-ThirdPartyNotices.txt), retained from the matching upstream version. |
| Silero VAD | [snakers4/silero-vad](https://github.com/snakers4/silero-vad), [MIT](licenses/Silero-VAD-MIT.txt); exact binary hash in the speech lock. |

The model, vocabulary, detector, native runtime and license texts are included in the desktop speech resource directory. Public map builds do not import the speech runtime.
