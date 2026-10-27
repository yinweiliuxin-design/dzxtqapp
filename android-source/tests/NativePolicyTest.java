package com.smartvio.studio.test;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.util.Arrays;

/** Real host-JVM checks of policy and bounded on-disk export transactions. */
public final class NativePolicyTest {
    private static int checks;
    private static void check(boolean value, String message) { checks++; if (!value) throw new AssertionError(message); }
    private interface Operation { void run() throws Exception; }
    private static void rejects(Operation action, String message) throws Exception {
        try { action.run(); } catch (IOException expected) { checks++; return; }
        throw new AssertionError(message);
    }
    public static void main(String[] args) throws Exception {
        String origin = NativePolicy.ORIGIN;
        check(NativePolicy.isTrusted(origin), "trusted root");
        check(NativePolicy.isTrusted(origin + "/?v=27#studio"), "trusted app route");
        check(NativePolicy.isTrusted(origin + ":443/path"), "explicit HTTPS port");
        for (String bad : new String[]{null, "", "https://", "http://" + NativePolicy.HOST, origin + ".evil.test", origin + "@evil.test", "https://evil@" + NativePolicy.HOST, origin + ":444", "javascript:alert(1)", "file:///secret", "content://secret", "data:text/html,test", "intent://test", "https://" + NativePolicy.HOST + "\\@evil.test"}) check(!NativePolicy.isTrusted(bad), "block URL: " + bad);
        check(NativePolicy.isExternalHttps("https://example.com/path"), "allow external https to browser");
        check(!NativePolicy.isExternalHttps(origin), "trusted not external");
        check(!NativePolicy.isExternalHttps("http://example.com"), "no external cleartext");
        check(!NativePolicy.isExternalHttps("https://user:pass@example.com"), "no embedded credentials");
        check(!NativePolicy.fileName("../../录音\\secret.wav").contains("/"), "safe filename slash");
        check(!NativePolicy.fileName("../../录音\\secret.wav").contains("\\"), "safe filename backslash");
        check(!NativePolicy.fileName("...secret").startsWith("."), "no dot prefix");
        check(NativePolicy.fileName(" ").equals("Silvio-export.bin"), "empty name fallback");
        check(NativePolicy.fileName(new String(new char[500]).replace('\0', 'a')).length() == 120, "name bound");
        check(NativePolicy.mime("audio/webm;codecs=opus").equals("audio/webm"), "mime strips codec");
        check(NativePolicy.mime("bad\nheader").equals("application/octet-stream"), "mime rejects headers");
        check(NativePolicy.id("export_12345"), "safe transaction id");
        check(!NativePolicy.id("../export"), "invalid id");
        File directory = Files.createTempDirectory("silvio-policy-").toFile();
        try {
            rejects(() -> new NativePolicy.Export(directory, "export_123", "a.wav", "audio/wav", -1), "negative total");
            rejects(() -> new NativePolicy.Export(directory, "export_123", "a.wav", "audio/wav", NativePolicy.MAX_EXPORT + 1), "maximum total");
            rejects(() -> new NativePolicy.Export(directory, "bad", "a.wav", "audio/wav", 1), "bad id");
            byte[] first = new byte[NativePolicy.CHUNK_BYTES], last = new byte[123];
            Arrays.fill(first, (byte) 71); Arrays.fill(last, (byte) 29);
            File completed;
            try (NativePolicy.Export export = new NativePolicy.Export(directory, "export_good", "录音.wav", "audio/wav", first.length + last.length)) {
                completed = export.file;
                check(export.append("export_good", 0, first) == first.length, "first ACK offset");
                rejects(() -> export.append("export_good", 0, last), "replayed offset");
                rejects(() -> export.append("export_other", first.length, last), "other id");
                rejects(() -> export.finish("export_good"), "early finish");
                check(export.append("export_good", first.length, last) == first.length + last.length, "final ACK offset");
                check(export.finish("export_good").length() == first.length + last.length, "complete bytes");
                byte[] output = Files.readAllBytes(export.file.toPath());
                check(Arrays.equals(Arrays.copyOf(output, first.length), first), "first chunk content intact");
                check(Arrays.equals(Arrays.copyOfRange(output, first.length, output.length), last), "final chunk content intact");
                check(export.complete(), "completed state");
                rejects(() -> export.finish("export_good"), "duplicate finish");
                rejects(() -> export.append("export_good", output.length, last), "append after finish");
            }
            check(!completed.exists(), "cache removed after success");
            File cancelled;
            try (NativePolicy.Export export = new NativePolicy.Export(directory, "export_cancel", "take.wav", "audio/wav", 2)) {
                cancelled = export.file;
                rejects(() -> export.append("export_cancel", 0, new byte[0]), "empty chunk");
                rejects(() -> export.append("export_cancel", 0, new byte[3]), "overflow total");
                rejects(() -> export.append("export_cancel", 0, new byte[NativePolicy.CHUNK_BYTES + 1]), "chunk limit");
                export.append("export_cancel", 0, new byte[]{42});
            }
            check(!cancelled.exists(), "cancel removes partial file");
            try (NativePolicy.Export empty = new NativePolicy.Export(directory, "export_empty", "empty.json", "application/json", 0)) {
                check(empty.finish("export_empty").length() == 0, "zero-byte file");
                empty.close();
                check(!empty.complete(), "close invalidates completed state");
                rejects(() -> empty.finish("export_empty"), "closed transaction invalid");
            }
            check(directory.list().length == 0, "no orphan temporary exports");
        } finally { directory.delete(); }
        System.out.println("NativePolicyTest: " + checks + " checks passed.");
    }
}
