/*
 * Copyright © 2026-present Oliver Wolff
 *
 * SPDX-License-Identifier: FSL-1.1-ALv2
 *
 * Licensed under the Functional Source License, Version 1.1, ALv2 Future License
 * (the "License"); you may not use this file except in compliance with the License.
 * The License is in the file LICENSE.md at the root of this repository and at
 * https://github.com/cuioss/Audit-Notary/blob/main/LICENSE.md.
 */
package de.cuioss.notary.audit.mock.scenario;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import org.jspecify.annotations.Nullable;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import java.util.regex.Pattern;

/**
 * Reads a scenario file and checks it against the scenario format (format version {@value #FORMAT_VERSION}).
 * <p>
 * Rules: the format version is {@value #FORMAT_VERSION}; name, user name and start are present; the start state and
 * every {@code next} of a link or a timed transition name an existing state; a route key is {@code "METHOD /path"}
 * and every method is {@code GET}, {@code POST}, {@code PUT} or {@code DELETE}; every path starts with
 * {@value #API_PREFIX}; a status lies between 100 and 599; the actions of a right are those of
 * {@link Right#ACTIONS}; a delay is not negative; the login provider is {@code oidc} or {@code local} and only
 * {@code local} has users, each with a username and a password; the state flags {@code session_replaced} and
 * {@code session_ended} are booleans. A violation throws a {@link ScenarioValidationException} naming
 * the source, the location and the rule.
 * <p>
 * A route or a link answers its {@code body}, or the JSON of the data file its {@code body_file} names: a file name of
 * the pattern {@code [a-z0-9][a-z0-9.-]*.json}, resolved by the data resolver the loader was created with (the
 * registry resolves it below {@code scenarios/data/}). Large or shared answers, such as the SAMM model, live there
 * once instead of inline in every profile, and a data file under another licence stays a file of its own. A route (not
 * a link) may instead name a built-in {@code handler} of the engine ({@link Handler}); it then has no
 * {@code body}, {@code body_file} or {@code status}.
 */
public final class ScenarioLoader {

    /** The only supported format version. */
    public static final int FORMAT_VERSION = 1;

    /** The prefix every mocked path carries. */
    public static final String API_PREFIX = "/api/v1/";

    private static final Set<String> METHODS = Set.of("GET", "POST", "PUT", "DELETE");
    private static final Pattern ROUTE_KEY = Pattern.compile("([A-Z]+) (\\S+)");
    private static final String LOGIN = "login";
    private static final Set<String> LOGIN_PROVIDERS = Set.of(ScenarioLogin.OIDC, ScenarioLogin.LOCAL);
    private static final String STATES = "states";
    private static final String ROUTES = "routes";
    private static final String NO_STATE = "names no state: ";
    private static final String STATUS = "status";
    private static final String BODY = "body";
    private static final String BODY_FILE = "body_file";
    private static final String HANDLER = "handler";
    private static final Pattern DATA_FILE = Pattern.compile("[a-z0-9][a-z0-9.-]*\\.json");

    private final ObjectMapper mapper;
    private final Function<String, Optional<String>> dataFiles;

    /**
     * Creates a loader that resolves no data file: a {@code body_file} is refused.
     *
     * @param mapper the mapper that parses the JSON text
     */
    public ScenarioLoader(ObjectMapper mapper) {
        this(mapper, name -> Optional.empty());
    }

    /**
     * Creates a loader.
     *
     * @param mapper    the mapper that parses the JSON text
     * @param dataFiles resolves the name of a data file to its JSON text, or empty when no such file exists
     */
    public ScenarioLoader(ObjectMapper mapper, Function<String, Optional<String>> dataFiles) {
        this.mapper = mapper;
        this.dataFiles = dataFiles;
    }

    /**
     * Parses and checks a scenario file.
     *
     * @param source the file or resource name, used in messages
     * @param text   the JSON text
     * @return the checked scenario
     * @throws ScenarioValidationException if the text is no JSON object or breaks a rule
     */
    public Scenario parse(String source, String text) {
        JsonNode root;
        try {
            root = mapper.readTree(text);
        } catch (JsonProcessingException e) {
            throw new ScenarioValidationException(source, "$", "not valid JSON: " + e.getOriginalMessage());
        }
        return read(source, root);
    }

    /**
     * Checks a parsed scenario file.
     *
     * @param source the file or resource name, used in messages
     * @param root   the parsed JSON
     * @return the checked scenario
     * @throws ScenarioValidationException if the JSON breaks a rule
     */
    public Scenario read(String source, @Nullable JsonNode root) {
        if (root == null || !root.isObject()) {
            throw new ScenarioValidationException(source, "$", "a scenario must be a JSON object");
        }
        var context = new Context(source);
        int version = root.path("format_version").asInt(-1);
        if (version != FORMAT_VERSION) {
            throw context.fail("format_version", "must be " + FORMAT_VERSION);
        }
        String name = requiredText(context, root, "name");
        String description = root.path("description").asText("");
        var login = readLogin(context, root.path("login"));
        var user = readUser(context, root.path("user"));
        var rights = readRights(context, root.path("rights"));
        boolean firstLogin = readBoolean(context, root, "first_login_required", false);
        String start = requiredText(context, root, "start");
        var routes = readRoutes(context, ROUTES, root.path(ROUTES));
        var statesNode = root.path(STATES);
        if (!statesNode.isObject() || statesNode.isEmpty()) {
            throw context.fail(STATES, "at least one state is required");
        }
        Map<String, ScenarioState> states = new LinkedHashMap<>();
        statesNode.properties().forEach(entry -> states.put(entry.getKey(),
                readState(context, entry.getKey(), entry.getValue())));
        if (!states.containsKey(start)) {
            throw context.fail("start", NO_STATE + start);
        }
        for (var state : states.values()) {
            checkTargets(context, state, states);
        }
        return new Scenario(name, description, login, user, rights, firstLogin, start, routes, states);
    }

    private static ScenarioLogin readLogin(Context context, JsonNode node) {
        if (node.isMissingNode()) {
            return ScenarioLogin.DEFAULT;
        }
        if (!node.isObject()) {
            throw context.fail(LOGIN, "must be an object");
        }
        var provider = node.path("provider");
        if (!provider.isTextual() || !LOGIN_PROVIDERS.contains(provider.asText())) {
            throw context.fail(LOGIN + ".provider", "must be one of oidc, local");
        }
        var usersNode = node.path("users");
        List<ScenarioLogin.LocalUser> users = new ArrayList<>();
        if (!usersNode.isMissingNode()) {
            if (!ScenarioLogin.LOCAL.equals(provider.asText())) {
                throw context.fail(LOGIN + ".users", "only the provider local has users");
            }
            if (!usersNode.isArray()) {
                throw context.fail(LOGIN + ".users", "must be an array");
            }
            int index = 0;
            for (var entry : usersNode) {
                var at = context.at(LOGIN + ".users[" + index + "]");
                users.add(new ScenarioLogin.LocalUser(requiredText(at, entry, "username"),
                        requiredText(at, entry, "password")));
                index++;
            }
        }
        return new ScenarioLogin(provider.asText(), users);
    }

    private static ScenarioUser readUser(Context context, JsonNode node) {
        if (!node.isObject()) {
            throw context.fail("user", "an object with name is required");
        }
        String name = requiredText(context, node, "name");
        var pseudonymNode = node.path("pseudonym");
        String pseudonym = pseudonymNode.isTextual() ? pseudonymNode.asText() : null;
        List<String> groups = new ArrayList<>();
        node.path("groups").forEach(group -> groups.add(group.asText()));
        return new ScenarioUser(pseudonym, name, groups);
    }

    private static List<Right> readRights(Context context, JsonNode node) {
        List<Right> rights = new ArrayList<>();
        if (node.isMissingNode()) {
            return rights;
        }
        if (!node.isArray()) {
            throw context.fail("rights", "must be an array");
        }
        int index = 0;
        for (var entry : node) {
            String location = "rights[" + index + "]";
            String repository = requiredText(context.at(location), entry, "repository");
            List<String> actions = new ArrayList<>();
            for (var action : entry.path("actions")) {
                if (!Right.ALLOWED_ACTIONS.contains(action.asText())) {
                    throw context.fail(location + ".actions", "unknown action: " + action.asText());
                }
                actions.add(action.asText());
            }
            rights.add(new Right(repository, actions));
            index++;
        }
        return rights;
    }

    private ScenarioState readState(Context context, String id, JsonNode node) {
        String location = STATES + "." + id;
        if (!node.isObject()) {
            throw context.fail(location, "a state must be an object");
        }
        var firstLoginNode = node.path("first_login_required");
        Boolean firstLogin = null;
        if (!firstLoginNode.isMissingNode()) {
            if (!firstLoginNode.isBoolean()) {
                throw context.fail(location + ".first_login_required", "must be a boolean");
            }
            firstLogin = firstLoginNode.asBoolean();
        }
        var routes = readRoutes(context, location + "." + ROUTES, node.path(ROUTES));
        Map<String, Link> links = new LinkedHashMap<>();
        node.path("links").properties().forEach(entry -> links.put(entry.getKey(),
                readLink(context, location + ".links." + entry.getKey(), entry.getKey(), entry.getValue())));
        List<ScenarioEvent> events = new ArrayList<>();
        int index = 0;
        for (var event : node.path("events")) {
            String eventLocation = location + ".events[" + index + "]";
            events.add(new ScenarioEvent(delay(context, eventLocation, event),
                    requiredText(context.at(eventLocation), event, "event"), bodyOf(event, "data")));
            index++;
        }
        AutoTransition auto = null;
        var autoNode = node.path("auto");
        if (!autoNode.isMissingNode()) {
            String autoLocation = location + ".auto";
            auto = new AutoTransition(delay(context, autoLocation, autoNode),
                    requiredText(context.at(autoLocation), autoNode, "next"));
        }
        var at = context.at(location);
        return new ScenarioState(id, node.path("description").asText(""), firstLogin, routes, links, events, auto,
                readBoolean(at, node, "session_replaced", false), readBoolean(at, node, "session_ended", false));
    }

    private Link readLink(Context context, String location, String name, JsonNode node) {
        String method = requiredText(context.at(location), node, "method");
        checkMethod(context, location + ".method", method);
        String path = requiredText(context.at(location), node, "path");
        checkPath(context, location + ".path", path);
        String next = requiredText(context.at(location), node, "next");
        return new Link(name, method, path, next, status(context, location, node), answerBody(context, location, node));
    }

    private Map<String, Route> readRoutes(Context context, String location, JsonNode node) {
        Map<String, Route> routes = new LinkedHashMap<>();
        if (node.isMissingNode()) {
            return routes;
        }
        if (!node.isObject()) {
            throw context.fail(location, "must be an object");
        }
        node.properties().forEach(entry -> {
            String key = entry.getKey();
            String routeLocation = location + "." + key;
            var matcher = ROUTE_KEY.matcher(key);
            if (!matcher.matches()) {
                throw context.fail(routeLocation, "a route key must be \"METHOD /path\"");
            }
            checkMethod(context, routeLocation, matcher.group(1));
            checkPath(context, routeLocation, matcher.group(2));
            routes.put(key, readRoute(context, routeLocation, entry.getValue()));
        });
        return routes;
    }

    /** A route answers a static body, or names a built-in handler of the engine and then carries nothing else. */
    private Route readRoute(Context context, String location, JsonNode node) {
        var handler = node.path(HANDLER);
        if (handler.isMissingNode()) {
            return new Route(status(context, location, node), answerBody(context, location, node));
        }
        String handlerLocation = location + "." + HANDLER;
        String name = handler.asText("");
        var named = handler.isTextual() ? Handler.byId(name) : Optional.<Handler>empty();
        if (named.isEmpty()) {
            throw context.fail(handlerLocation, "must be one of " + Handler.ids() + ": " + name);
        }
        for (String member : List.of(BODY, BODY_FILE, STATUS)) {
            if (!node.path(member).isMissingNode()) {
                throw context.fail(handlerLocation, "a route with a handler has no " + member);
            }
        }
        return new Route(200, JsonNodeFactory.instance.objectNode(), named.get());
    }

    private static void checkTargets(Context context, ScenarioState state, Map<String, ScenarioState> states) {
        for (var link : state.links().values()) {
            if (!states.containsKey(link.next())) {
                throw context.fail(STATES + "." + state.id() + ".links." + link.name() + ".next",
                        NO_STATE + link.next());
            }
        }
        var auto = state.auto();
        if (auto != null && !states.containsKey(auto.next())) {
            throw context.fail(STATES + "." + state.id() + ".auto.next", NO_STATE + auto.next());
        }
    }

    private static void checkMethod(Context context, String location, String method) {
        if (!METHODS.contains(method)) {
            throw context.fail(location, "method must be one of GET, POST, PUT, DELETE: " + method);
        }
    }

    private static void checkPath(Context context, String location, String path) {
        if (!path.startsWith(API_PREFIX) || path.contains("?")) {
            throw context.fail(location, "path must start with " + API_PREFIX + " and carry no query: " + path);
        }
    }

    private static int status(Context context, String location, JsonNode node) {
        var statusNode = node.path(STATUS);
        if (statusNode.isMissingNode()) {
            return 200;
        }
        int status = statusNode.asInt(-1);
        if (!statusNode.isInt() || status < 100 || status > 599) {
            throw context.fail(location + "." + STATUS, "must be an HTTP status between 100 and 599");
        }
        return status;
    }

    private static long delay(Context context, String location, JsonNode node) {
        var delayNode = node.path("after_ms");
        if (delayNode.isMissingNode()) {
            return 0;
        }
        if (!delayNode.canConvertToLong() || delayNode.asLong() < 0) {
            throw context.fail(location + ".after_ms", "must be a non-negative number");
        }
        return delayNode.asLong();
    }

    private static boolean readBoolean(Context context, JsonNode node, String field, boolean fallback) {
        var value = node.path(field);
        if (value.isMissingNode()) {
            return fallback;
        }
        if (!value.isBoolean()) {
            throw context.fail(field, "must be a boolean");
        }
        return value.asBoolean();
    }

    /**
     * The body of an answer: {@code body}, or the JSON of the data file {@code body_file} names.
     */
    private JsonNode answerBody(Context context, String location, JsonNode node) {
        var file = node.path(BODY_FILE);
        if (file.isMissingNode()) {
            return bodyOf(node, BODY);
        }
        String fileLocation = location + "." + BODY_FILE;
        if (!node.path(BODY).isMissingNode()) {
            throw context.fail(fileLocation, "an answer has either body or body_file");
        }
        String name = file.asText("");
        if (!file.isTextual() || !DATA_FILE.matcher(name).matches()) {
            throw context.fail(fileLocation, "must name a data file of the pattern [a-z0-9][a-z0-9.-]*.json: " + name);
        }
        String text = dataFiles.apply(name)
                .orElseThrow(() -> context.fail(fileLocation, "names no data file: " + name));
        JsonNode body;
        try {
            body = mapper.reader().with(DeserializationFeature.FAIL_ON_TRAILING_TOKENS).readTree(text);
        } catch (JsonProcessingException e) {
            throw context.fail(fileLocation, "data file " + name + " is not valid JSON: " + e.getOriginalMessage());
        }
        if (body == null || body.isMissingNode()) {
            throw context.fail(fileLocation, "data file " + name + " holds no JSON value");
        }
        return body;
    }

    private static JsonNode bodyOf(JsonNode node, String field) {
        var body = node.path(field);
        return body.isMissingNode() ? JsonNodeFactory.instance.objectNode() : body;
    }

    private static String requiredText(Context context, JsonNode node, String field) {
        var value = node.path(field);
        if (!value.isTextual() || value.asText().isBlank()) {
            throw context.fail(field, "a non-blank string is required");
        }
        return value.asText();
    }

    /** The source and the location prefix of messages. */
    private record Context(String source, String prefix) {

        Context(String source) {
            this(source, "");
        }

        Context at(String location) {
            return new Context(source, location + ".");
        }

        ScenarioValidationException fail(String location, String detail) {
            return new ScenarioValidationException(source, prefix + location, detail);
        }
    }
}
