# 第三方组件、许可证与源代码

本说明随 FrameCode 0.3.4 分发，核对日期：2026-10-20。第三方组件由各自作者享有版权，并按各自许可证提供。FrameCode 的项目许可证或发布说明不替代、不限制这些许可证授予的权利。各许可证中的版权、免责和责任限制条款仍然适用。

本目录保存能够确认的上游许可证原文和来源索引；组件原目录中的许可证也应一并保留。下列路径以应用的 `resources/app/` 为基准；Electron 的许可证位于 `FrameCode.exe` 同级目录。

## 随包组件

| 组件 | 来源与许可证位置 |
| --- | --- |
| Electron 44.9.0、Chromium 及其依赖 | [Electron 源码](https://github.com/electron/electron/tree/v44.9.0)；应用根目录的 `LICENSE`、`LICENSES.chromium.html` 保存实际随包声明。 |
| hls.js 1.7.3 | [上游源码](https://github.com/video-dev/hls.js/tree/v1.7.3)，Apache-2.0；`node_modules/hls.js/LICENSE`。 |
| mpegts.js 1.8.2 | [上游源码](https://github.com/xqq/mpegts.js/tree/v1.8.2)，Apache-2.0；`node_modules/mpegts.js/LICENSE`。 |
| Streamlink 8.6.2 | [源码归档](https://github.com/streamlink/streamlink/archive/refs/tags/8.6.2.tar.gz)，BSD-2-Clause；`resources/streamlink/streamlink-8.6.2-1-py314-x86_64/LICENSE.txt`。 |
| Python 及 Streamlink 的 Python 依赖 | [CPython 源码](https://github.com/python/cpython)、[Streamlink Windows 构建项目](https://github.com/streamlink/windows-builds)；实际随包版权和许可保存在同一 Streamlink 目录的 `Python/LICENSE.txt` 及 `pkgs/*.dist-info/` 下的 `LICENSE*`、`licenses/`、`NOTICE` 文件。Python 自身使用 PSF 及历史许可证，不能将全部依赖统一视作 BSD 或 PSF。 |
| FFmpeg `n9.0.1-6-g9d4ca21220` | GPLv3 构建，详见下一节；同一 Streamlink 目录的 `ffmpeg/LICENSE.txt`、`ffmpeg/BUILDINFO.txt` 保留许可证及构建信息。 |
| Tesseract、Leptonica、语言数据与 OCR 动态库 | 详见后面的 OCR 清单和 `licenses/`。 |

## FFmpeg 的确切源码与构建信息

随包 `ffmpeg/BUILDINFO.txt` 记录此版本启用了 `--enable-gpl --enable-version3 --disable-debug`，因此应按该 GPLv3 构建的实际许可证处理，不能将其描述为 LGPL-only。

- FFmpeg 源码提交：`9d4ca21220bfd3f06fc8bfc90ddf0f6d0a484611`。
- [下载该提交的 FFmpeg 源码归档](https://github.com/FFmpeg/FFmpeg/archive/9d4ca21220bfd3f06fc8bfc90ddf0f6d0a484611.tar.gz)。
- Streamlink/FFmpeg-Builds 构建脚本提交：`7def83d2a56f837b9dbb4b46e0d8b4617fa44cca`。
- [下载该提交的构建脚本归档](https://github.com/streamlink/FFmpeg-Builds/archive/7def83d2a56f837b9dbb4b46e0d8b4617fa44cca.tar.gz)。
- [FFmpeg 上游许可说明](https://ffmpeg.org/legal.html)。

这些链接分别指向已识别的 FFmpeg 源码及构建脚本。构建过程中获取的外部库还可能有各自的源码和许可证要求；不能把上述两个归档自动视作包含所有外部库的完整对应源码包，也不能把本说明当作书面源码提供承诺。

## OCR 运行库

`resources/ocr-runtime/manifest.sha256.json` 记录实际分发文件的 SHA-256。为保持其完整性，许可证放在本目录，不向 OCR 校验目录增加文件。

主要 OCR 上游：

- [Tesseract](https://github.com/tesseract-ocr/tesseract)：Apache-2.0；原文见 `licenses/tesseract-LICENSE.txt`。
- [Leptonica](https://github.com/DanBloomberg/leptonica)：BSD-2-Clause；包含版权和免责条款的上游原文见 `licenses/leptonica-LICENSE.txt`。
- [tessdata_fast](https://github.com/tesseract-ocr/tessdata_fast)：Apache-2.0；上游许可原文见 `licenses/tessdata-fast-LICENSE.txt`。随包 `eng.traineddata` 和 `chi_sim.traineddata` 的具体文件以 manifest 中的哈希为准；本说明不据文件名断言其精确上游提交。

以下表格按实际 DLL 文件名列出对应项目，提供查找源码和项目许可的入口。它不是精确版本的包管理器清单；目前仓库未保留每个 DLL 的原始二进制包、补丁和构建记录，不能仅凭这些文件名确认其版本、发行方或完成所有对应源码义务。

| 随包文件 | 上游项目 / 源码入口 |
| --- | --- |
| `libtesseract-5.dll` | [Tesseract](https://github.com/tesseract-ocr/tesseract) |
| `libleptonica-6.dll` | [Leptonica](https://github.com/DanBloomberg/leptonica) |
| `libgcc_s_seh-1.dll`, `libstdc++-6.dll` | [GCC](https://gcc.gnu.org/git.html)；GPL 和 GCC Runtime Library Exception，相关原文见 `licenses/`。例外有具体适用条件，并非对所有组件免除 GPL 义务。 |
| `libwinpthread-1.dll` | [mingw-w64 / winpthreads](https://github.com/mingw-w64/mingw-w64/tree/master/mingw-w64-libraries/winpthreads)；见 `licenses/winpthreads-COPYING.txt`。 |
| `libarchive-13.dll` | [libarchive](https://github.com/libarchive/libarchive) |
| `libb2-1.dll` | [libb2](https://github.com/BLAKE2/libb2) |
| `libbrotlicommon.dll`, `libbrotlidec.dll` | [Brotli](https://github.com/google/brotli) |
| `libbz2-1.dll` | [bzip2](https://sourceware.org/bzip2/) |
| `libcairo-2.dll` | [Cairo](https://gitlab.freedesktop.org/cairo/cairo) |
| `libcrypto-3-x64.dll` | [OpenSSL](https://github.com/openssl/openssl) |
| `libcurl-4.dll` | [curl](https://github.com/curl/curl) |
| `libdatrie-1.dll` | [libdatrie](https://github.com/tlwg/libdatrie) |
| `libdeflate.dll` | [libdeflate](https://github.com/ebiggers/libdeflate) |
| `libexpat-1.dll` | [Expat](https://github.com/libexpat/libexpat) |
| `libffi-8.dll` | [libffi](https://github.com/libffi/libffi) |
| `libfontconfig-1.dll` | [Fontconfig](https://gitlab.freedesktop.org/fontconfig/fontconfig) |
| `libfreetype-6.dll` | [FreeType](https://gitlab.freedesktop.org/freetype/freetype) |
| `libfribidi-0.dll` | [FriBidi](https://github.com/fribidi/fribidi) |
| `libgif-7.dll` | [giflib](https://sourceforge.net/projects/giflib/) |
| `libgio-2.0-0.dll`, `libglib-2.0-0.dll`, `libgmodule-2.0-0.dll`, `libgobject-2.0-0.dll` | [GLib](https://gitlab.gnome.org/GNOME/glib) |
| `libgraphite2.dll` | [Graphite](https://github.com/silnrsi/graphite) |
| `libharfbuzz-0.dll` | [HarfBuzz](https://github.com/harfbuzz/harfbuzz) |
| `libiconv-2.dll` | [GNU libiconv](https://www.gnu.org/software/libiconv/) |
| `libicudt75.dll`, `libicuin75.dll`, `libicuuc75.dll` | [ICU](https://github.com/unicode-org/icu) |
| `libidn2-0.dll` | [GNU libidn2](https://www.gnu.org/software/libidn/) |
| `libintl-8.dll` | [GNU gettext](https://www.gnu.org/software/gettext/) |
| `libjbig-0.dll` | [JBIG-KIT](https://www.cl.cam.ac.uk/~mgk25/jbigkit/) |
| `libjpeg-8.dll` | [libjpeg-turbo](https://github.com/libjpeg-turbo/libjpeg-turbo) |
| `libLerc.dll` | [LERC](https://github.com/Esri/lerc) |
| `liblz4.dll` | [LZ4](https://github.com/lz4/lz4) |
| `liblzma-5.dll` | [XZ Utils](https://github.com/tukaani-project/xz) |
| `libopenjp2-7.dll` | [OpenJPEG](https://github.com/uclouvain/openjpeg) |
| `libpango-1.0-0.dll`, `libpangocairo-1.0-0.dll`, `libpangoft2-1.0-0.dll`, `libpangowin32-1.0-0.dll` | [Pango](https://gitlab.gnome.org/GNOME/pango) |
| `libpcre2-8-0.dll` | [PCRE2](https://github.com/PCRE2Project/pcre2) |
| `libpixman-1-0.dll` | [Pixman](https://gitlab.freedesktop.org/pixman/pixman) |
| `libpng16-16.dll` | [libpng](https://github.com/pnggroup/libpng) |
| `libpsl-5.dll` | [libpsl](https://github.com/rockdaboot/libpsl) |
| `libsharpyuv-0.dll`, `libwebp-7.dll`, `libwebpmux-3.dll` | [libwebp](https://chromium.googlesource.com/webm/libwebp/) |
| `libssh2-1.dll` | [libssh2](https://github.com/libssh2/libssh2) |
| `libthai-0.dll` | [libthai](https://github.com/tlwg/libthai) |
| `libtiff-6.dll` | [libtiff](https://gitlab.com/libtiff/libtiff) |
| `libunistring-5.dll` | [GNU libunistring](https://www.gnu.org/software/libunistring/) |
| `libzstd.dll` | [Zstandard](https://github.com/facebook/zstd) |
| `zlib1.dll` | [zlib](https://github.com/madler/zlib) |

GNU GPL、LGPL 及 GCC 运行库例外的官方文本放在 `licenses/`，只适用于相应组件，不表示给整个 FrameCode 或所有 DLL 统一重新许可。`room-code-assistant-worker.exe` 是单独的随包 OCR 工作进程；此目录未取得其独立源码及第三方依赖构建清单，因此不将它标注为 Tesseract 项目官方可执行文件。

## 许可原文的来源

`license-sources.json` 记录本目录下载的上游许可证 URL。它们作为已识别项目的许可参考和版权声明保留；对于尚未确证版本的二进制，不能以当前上游文本代替原二进制发行包可能要求保留的全部声明。完整的逐二进制许可与对应源码核验仍需要原始构建和包来源记录。本说明未声称已完成该项核验。
