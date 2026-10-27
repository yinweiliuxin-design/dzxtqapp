package com.smartvio.studio.test;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.net.URI;
import java.util.Locale;

/** Small platform-independent rules: strict origin and bounded sequential exports. */
public final class NativePolicy {
    public static final String HOST = "smartvio-studio-mobile.politecalf5.chatgpt.site";
    public static final String ORIGIN = "https://" + HOST;
    public static final long MAX_EXPORT = 100L * 1024 * 1024;
    public static final int CHUNK_BYTES = 48 * 1024;
    private NativePolicy() {}

    public static boolean isTrusted(String value) {
        try {
            URI u = new URI(value);
            return "https".equalsIgnoreCase(u.getScheme()) && HOST.equalsIgnoreCase(u.getHost())
                && u.getRawUserInfo() == null && (u.getPort() == -1 || u.getPort() == 443);
        } catch (Exception ignored) { return false; }
    }
    public static boolean isExternalHttps(String value) {
        try {
            URI u = new URI(value);
            return "https".equalsIgnoreCase(u.getScheme()) && u.getHost() != null
                && u.getRawUserInfo() == null && (u.getPort() == -1 || u.getPort() == 443)
                && !isTrusted(value);
        } catch (Exception ignored) { return false; }
    }
    public static String fileName(String value) {
        String name = value == null ? "" : value.replaceAll("[\\p{Cntrl}\\\\/:*?\"<>|]", "_").trim();
        while (name.startsWith(".")) name = name.substring(1);
        if (name.length() > 120) name = name.substring(0, 120);
        return name.isEmpty() ? "Silvio-export.bin" : name;
    }
    public static String mime(String value) {
        if (value == null) return "application/octet-stream";
        String simple = value.toLowerCase(Locale.ROOT).split(";", 2)[0].trim();
        return simple.matches("[a-z0-9!#$&^_.+-]+/[a-z0-9!#$&^_.+-]+") && simple.length() < 100
            ? simple : "application/octet-stream";
    }
    public static boolean id(String value) {
        return value != null && value.matches("[a-zA-Z0-9_-]{8,80}");
    }
    public static final class Export implements AutoCloseable {
        public final String id, name, mime;
        public final long total;
        public final File file;
        private FileOutputStream output;
        private long written;
        private boolean complete, closed;

        public Export(File directory, String id, String name, String mime, long total) throws IOException {
            if (!NativePolicy.id(id) || total < 0 || total > MAX_EXPORT) throw new IOException("Invalid export size or id");
            if (!directory.isDirectory() && !directory.mkdirs()) throw new IOException("Cannot create export cache");
            this.id = id; this.name = fileName(name); this.mime = NativePolicy.mime(mime); this.total = total;
            this.file = File.createTempFile("silvio-export-", ".part", directory);
            output = new FileOutputStream(file);
        }
        public synchronized long append(String id, long offset, byte[] bytes) throws IOException {
            if (closed || complete || !this.id.equals(id) || offset != written || bytes == null
                || bytes.length == 0 || bytes.length > CHUNK_BYTES || written + bytes.length > total)
                throw new IOException("Export sequence or size mismatch");
            output.write(bytes); written += bytes.length; return written;
        }
        public synchronized File finish(String id) throws IOException {
            if (closed || complete || !this.id.equals(id) || written != total) throw new IOException("Incomplete export");
            output.flush(); output.getFD().sync(); output.close(); output = null; complete = true; return file;
        }
        public synchronized boolean complete() { return complete && !closed; }
        public synchronized long written() { return written; }
        public synchronized void close() {
            if (closed) return; closed = true;
            try { if (output != null) output.close(); } catch (IOException ignored) {}
            output = null;
            if (file.exists()) file.delete();
        }
    }
}
