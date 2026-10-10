package com.ember.visuals;

import com.jcraft.jogg.Packet;
import com.jcraft.jogg.Page;
import com.jcraft.jogg.StreamState;
import com.jcraft.jogg.SyncState;
import com.jcraft.jorbis.Block;
import com.jcraft.jorbis.Comment;
import com.jcraft.jorbis.DspState;
import com.jcraft.jorbis.Info;
import javazoom.jl.decoder.Bitstream;
import javazoom.jl.decoder.BitstreamException;
import javazoom.jl.decoder.Decoder;
import javazoom.jl.decoder.DecoderException;
import javazoom.jl.decoder.Header;
import javazoom.jl.decoder.SampleBuffer;

import javax.sound.sampled.AudioFormat;
import javax.sound.sampled.AudioInputStream;
import javax.sound.sampled.AudioSystem;
import javax.sound.sampled.UnsupportedAudioFileException;
import java.io.Closeable;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Декодеры в PCM 16 бит little-endian: WAV (встроенный javax.sound), MP3 (JLayer), OGG Vorbis (JOrbis).
 * Используются только из потока проигрывания, поэтому не потокобезопасны.
 */
public final class AudioDecoders {
    private AudioDecoders() {}

    public abstract static class PcmDecoder implements Closeable {
        public int channels;
        public float sampleRate;

        /** Заполняет out PCM-данными. Возвращает число байт или -1 в конце трека. */
        public abstract int read(byte[] out) throws IOException;

        public AudioFormat format() {
            return new AudioFormat(sampleRate, 16, channels, true, false);
        }
    }

    public static PcmDecoder open(Path file) throws IOException {
        String name = file.getFileName().toString().toLowerCase();
        if (name.endsWith(".wav")) return openWav(file);
        if (name.endsWith(".mp3")) return new Mp3Decoder(Files.newInputStream(file));
        if (name.endsWith(".ogg")) return new OggDecoder(Files.newInputStream(file));
        throw new IOException("Формат не поддерживается: " + name);
    }

    // ---------- WAV ----------
    private static PcmDecoder openWav(Path file) throws IOException {
        AudioInputStream src;
        try {
            src = AudioSystem.getAudioInputStream(file.toFile());
        } catch (UnsupportedAudioFileException e) {
            throw new IOException("Некорректный WAV: " + e.getMessage(), e);
        }
        AudioFormat f = src.getFormat();
        AudioFormat target = new AudioFormat(f.getSampleRate(), 16, f.getChannels(), true, false);
        final AudioInputStream pcm;
        try {
            pcm = AudioSystem.getAudioInputStream(target, src);
        } catch (IllegalArgumentException e) {
            throw new IOException("WAV в этом формате не поддерживается", e);
        }
        return new WavDecoder(pcm, f.getChannels(), f.getSampleRate());
    }

    static final class WavDecoder extends PcmDecoder {
        private final AudioInputStream stream;

        WavDecoder(AudioInputStream stream, int channels, float rate) {
            this.stream = stream;
            this.channels = channels;
            this.sampleRate = rate;
        }

        @Override public int read(byte[] out) throws IOException {
            return stream.read(out, 0, out.length);
        }

        @Override public void close() throws IOException {
            stream.close();
        }
    }

    // ---------- MP3 ----------
    static final class Mp3Decoder extends PcmDecoder {
        private final InputStream in;
        private final Bitstream bitstream;
        private final Decoder decoder = new Decoder();
        private short[] pending = new short[0];
        private int pendingLen = 0;
        private int pendingPos = 0;

        Mp3Decoder(InputStream in) throws IOException {
            this.in = in;
            this.bitstream = new Bitstream(in);
            // Первый кадр нужен, чтобы узнать частоту и число каналов
            if (!decodeNext()) throw new IOException("MP3 без аудиокадров");
            pendingPos = 0;
        }

        private boolean decodeNext() throws IOException {
            try {
                Header h = bitstream.readFrame();
                if (h == null) return false;
                SampleBuffer sb = (SampleBuffer) decoder.decodeFrame(h, bitstream);
                if (channels == 0) {
                    channels = sb.getChannelCount();
                    sampleRate = sb.getSampleFrequency();
                }
                pending = sb.getBuffer();
                pendingLen = sb.getBufferLength();
                pendingPos = 0;
                bitstream.closeFrame();
                return true;
            } catch (BitstreamException | DecoderException e) {
                throw new IOException("Ошибка MP3: " + e.getMessage(), e);
            }
        }

        @Override public int read(byte[] out) throws IOException {
            int written = 0;
            while (written + 1 < out.length) {
                if (pendingPos >= pendingLen && !decodeNext()) break;
                while (pendingPos < pendingLen && written + 1 < out.length) {
                    short s = pending[pendingPos++];
                    out[written++] = (byte) (s & 0xff);
                    out[written++] = (byte) ((s >> 8) & 0xff);
                }
            }
            return written == 0 ? -1 : written;
        }

        @Override public void close() throws IOException {
            try {
                bitstream.close();
            } catch (BitstreamException ignored) {
                // поток уже закрыт
            }
            in.close();
        }
    }

    // ---------- OGG Vorbis ----------
    static final class OggDecoder extends PcmDecoder {
        private final InputStream in;
        private final SyncState oy = new SyncState();
        private final StreamState os = new StreamState();
        private final Page og = new Page();
        private final Packet op = new Packet();
        private final Info vi = new Info();
        private final Comment vc = new Comment();
        private final DspState vd = new DspState();
        private final Block vb = new Block(vd);
        private final float[][][] pcm = new float[1][][];
        private int[] index = new int[0];
        private byte[] pend = new byte[0];
        private int pendLen = 0;
        private int pendPos = 0;
        private boolean inputDone = false;
        private boolean streamInit = false;

        OggDecoder(InputStream in) throws IOException {
            this.in = in;
            oy.init();
            int headers = 0;
            while (headers < 3) {
                int r = oy.pageout(og);
                if (r == 1) {
                    if (!streamInit) {
                        os.init(og.serialno());
                        streamInit = true;
                    }
                    os.pagein(og);
                    while (headers < 3 && os.packetout(op) == 1) {
                        if (vi.synthesis_headerin(vc, op) < 0) throw new IOException("Некорректный заголовок OGG");
                        headers++;
                    }
                } else if (r == 0 && !readMore()) {
                    throw new IOException("OGG без заголовков Vorbis");
                }
            }
            vd.synthesis_init(vi);
            vb.init(vd);
            channels = vi.channels;
            sampleRate = vi.rate;
            index = new int[channels];
        }

        private boolean readMore() throws IOException {
            if (inputDone) return false;
            int idx = oy.buffer(4096);
            int n = in.read(oy.data, idx, 4096);
            if (n <= 0) {
                inputDone = true;
                return false;
            }
            oy.wrote(n);
            return true;
        }

        /** Берёт следующую порцию PCM из декодера. false — трек закончился. */
        private boolean fill() throws IOException {
            while (true) {
                int samples = vd.synthesis_pcmout(pcm, index);
                if (samples > 0) {
                    toPending(samples);
                    vd.synthesis_read(samples);
                    return true;
                }
                if (os.packetout(op) == 1) {
                    if (vb.synthesis(op) == 0) vd.synthesis_blockin(vb);
                    continue;
                }
                int r = oy.pageout(og);
                if (r == 1) {
                    os.pagein(og);
                    continue;
                }
                if (r == -1) continue;
                if (!readMore()) return false;
            }
        }

        private void toPending(int samples) {
            int need = samples * channels * 2;
            if (pend.length < need) pend = new byte[need];
            int p = 0;
            for (int j = 0; j < samples; j++) {
                for (int c = 0; c < channels; c++) {
                    int v = (int) (pcm[0][c][index[c] + j] * 32767f);
                    if (v > 32767) v = 32767;
                    else if (v < -32768) v = -32768;
                    pend[p++] = (byte) (v & 0xff);
                    pend[p++] = (byte) ((v >> 8) & 0xff);
                }
            }
            pendLen = need;
            pendPos = 0;
        }

        @Override public int read(byte[] out) throws IOException {
            int written = 0;
            while (written < out.length) {
                if (pendPos >= pendLen && !fill()) break;
                int n = Math.min(pendLen - pendPos, out.length - written);
                System.arraycopy(pend, pendPos, out, written, n);
                pendPos += n;
                written += n;
            }
            return written == 0 ? -1 : written;
        }

        @Override public void close() throws IOException {
            in.close();
        }
    }
}
