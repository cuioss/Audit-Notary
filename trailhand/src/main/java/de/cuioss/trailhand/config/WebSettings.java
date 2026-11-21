/*
 * Copyright © 2026-present CUI-OpenSource-Software (info@cuioss.de)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package de.cuioss.trailhand.config;

import java.net.InetAddress;
import java.net.URI;
import java.net.UnknownHostException;
import java.time.Duration;
import java.util.Locale;
import java.util.Optional;

/**
 * The web app: {@code trailhand.yaml} → {@code web} (TRH-AUTH-1, TRH-WEB-8).
 *
 * @param origin      the application's own origin, an absolute {@code https} URI without path; the Origin check and
 *                    the login callback address use it
 * @param idleTimeout the idle time after which a session ends, default 30 minutes
 * @param maxLifetime the absolute lifetime of a session, default 8 hours
 */
public record WebSettings(URI origin, Duration idleTimeout, Duration maxLifetime) {

    private static final int HTTPS_PORT = 443;
    private static final int HTTP_PORT = 80;
    private static final int IPV4_BYTES = 4;
    private static final int IPV6_BYTES = 16;
    private static final int IPV6_PIECES = 8;

    /** The default of {@code session.idle-timeout}. */
    public static final Duration DEFAULT_IDLE_TIMEOUT = Duration.ofMinutes(30);

    /** The default of {@code session.max-lifetime}. */
    public static final Duration DEFAULT_MAX_LIFETIME = Duration.ofHours(8);

    /**
     * @return the origin as the browser sends it in the {@code Origin} header: scheme and host in lower case and the
     *         port only when it is not the default of the scheme (RFC 6454, section 6.1)
     */
    public String originHeaderValue() {
        var scheme = origin.getScheme().toLowerCase(Locale.ROOT);
        var defaultPort = "https".equals(scheme) ? HTTPS_PORT : HTTP_PORT;
        var port = origin.getPort() == -1 || origin.getPort() == defaultPort ? "" : ":" + origin.getPort();
        return scheme + "://" + browserHost(origin.getHost()) + port;
    }

    /**
     * @param host the host of a URI: a name, an IPv4 address or a bracketed IPv6 literal
     * @return the host as the browser serializes it: a name in lower case, an IPv6 literal in the form of the URL
     *         Standard's IPv6 serializer (section 3.6: lower-case hexadecimal without leading zeros, the first longest
     *         run of two or more zero pieces as {@code ::}, no embedded IPv4)
     */
    static String browserHost(String host) {
        var lower = host.toLowerCase(Locale.ROOT);
        if (!lower.startsWith("[") || !lower.endsWith("]")) {
            return lower;
        }
        return ipv6Pieces(lower.substring(1, lower.length() - 1)).map(pieces -> "[" + ipv6Text(pieces) + "]")
                .orElse(lower);
    }

    /**
     * @param literal an IPv6 literal without brackets
     * @return its eight pieces, or empty when it is no IPv6 literal
     */
    private static Optional<int[]> ipv6Pieces(String literal) {
        byte[] bytes;
        try {
            // A literal is only parsed, never looked up.
            bytes = InetAddress.getByName(literal).getAddress();
        } catch (UnknownHostException e) {
            return Optional.empty();
        }
        if (bytes.length == IPV4_BYTES) {
            // Java answers an IPv4-mapped literal (::ffff:a.b.c.d) with the IPv4 address; the browser keeps it IPv6.
            var mapped = new byte[IPV6_BYTES];
            mapped[10] = (byte) 0xff;
            mapped[11] = (byte) 0xff;
            System.arraycopy(bytes, 0, mapped, 12, IPV4_BYTES);
            bytes = mapped;
        }
        var pieces = new int[IPV6_PIECES];
        for (int index = 0; index < IPV6_PIECES; index++) {
            pieces[index] = ((bytes[2 * index] & 0xff) << 8) | (bytes[2 * index + 1] & 0xff);
        }
        return Optional.of(pieces);
    }

    /**
     * @param pieces the eight pieces of an IPv6 address
     * @return the address as the URL Standard's IPv6 serializer writes it
     */
    private static String ipv6Text(int[] pieces) {
        var compress = compressedPiece(pieces);
        var text = new StringBuilder();
        var index = 0;
        while (index < IPV6_PIECES) {
            if (index == compress) {
                text.append(index == 0 ? "::" : ":");
                index += zeroRun(pieces, index);
            } else {
                text.append(Integer.toHexString(pieces[index]));
                if (index < IPV6_PIECES - 1) {
                    text.append(':');
                }
                index++;
            }
        }
        return text.toString();
    }

    /**
     * @param pieces the eight pieces of an IPv6 address
     * @return the index of the first longest run of two or more zero pieces, or {@code -1}
     */
    private static int compressedPiece(int[] pieces) {
        var longestIndex = -1;
        var longestSize = 1;
        var index = 0;
        while (index < pieces.length) {
            var size = zeroRun(pieces, index);
            if (size > longestSize) {
                longestIndex = index;
                longestSize = size;
            }
            index += Math.max(size, 1);
        }
        return longestIndex;
    }

    private static int zeroRun(int[] pieces, int start) {
        var size = 0;
        while (start + size < pieces.length && pieces[start + size] == 0) {
            size++;
        }
        return size;
    }
}
