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
package de.cuioss.trailhand.mock.runtime;

import org.jspecify.annotations.Nullable;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * An answer of the engine.
 *
 * @param status      the HTTP status
 * @param contentType the content type
 * @param body        the body bytes
 * @param headers     additional headers, as name and value pairs in order
 * @param eventStream whether the HTTP adapter must keep the exchange open as event stream instead of sending a body
 */
public record MockResponse(int status, String contentType, byte[] body, List<Map.Entry<String, String>> headers,
boolean eventStream) {

    /** The content type of every JSON answer. */
    public static final String JSON = "application/json; charset=utf-8";

    /** The content type of the HTML pages of the login emulation. */
    public static final String HTML = "text/html; charset=utf-8";

    /** The content type of the event stream. */
    public static final String EVENT_STREAM = "text/event-stream";

    /**
     * Copies the headers.
     *
     * @param status      the status
     * @param contentType the content type
     * @param body        the body
     * @param headers     the headers
     * @param eventStream whether this opens the event stream
     */
    public MockResponse {
        headers = List.copyOf(headers);
        body = body.clone();
    }

    /**
     * A text answer without additional headers.
     *
     * @param status      the status
     * @param contentType the content type
     * @param text        the body text, written as UTF-8
     * @return the answer
     */
    public static MockResponse text(int status, String contentType, String text) {
        return new MockResponse(status, contentType, text.getBytes(StandardCharsets.UTF_8), List.of(), false);
    }

    /**
     * The answer that opens the event stream.
     *
     * @return the event-stream marker
     */
    public static MockResponse openEventStream() {
        return new MockResponse(200, EVENT_STREAM, new byte[0], List.of(), true);
    }

    /**
     * A copy with one more header.
     *
     * @param name  the header name
     * @param value the header value
     * @return the copy
     */
    public MockResponse withHeader(String name, String value) {
        var all = new ArrayList<>(headers);
        all.add(Map.entry(name, value));
        return new MockResponse(status, contentType, body, all, eventStream);
    }

    /**
     * The body as text.
     *
     * @return the body decoded as UTF-8
     */
    public String bodyText() {
        return new String(body, StandardCharsets.UTF_8);
    }

    @Override
    public byte[] body() {
        return body.clone();
    }

    @Override
    public boolean equals(@Nullable Object other) {
        return other instanceof MockResponse that && status == that.status && eventStream == that.eventStream
                && contentType.equals(that.contentType) && Arrays.equals(body, that.body)
                && headers.equals(that.headers);
    }

    @Override
    public int hashCode() {
        return Objects.hash(status, contentType, Arrays.hashCode(body), headers, eventStream);
    }

    @Override
    public String toString() {
        return "MockResponse[status=" + status + ", contentType=" + contentType + ", eventStream=" + eventStream + "]";
    }
}
