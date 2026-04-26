// AkariNet ATPK (Automaton Package) Loader v1.1.0
// Improved parser validation, dependency handling, and runtime safety.

(function () {
    'use strict';

    const DEFAULT_PRIORITY = 100;
    const STORAGE_KEYS = {
        urls: 'akari:automata_urls',
        blacklist: 'akari:automata_blacklist'
    };

    class ATPKParser {
        parse(content) {
            if (typeof content !== 'string' || content.trim().length === 0) {
                throw new Error('ATPK content is empty or invalid');
            }

            const lines = content.replace(/\r\n/g, '\n').split('\n');
            const pkg = {
                name: null,
                description: null,
                automata: []
            };

            let i = 0;
            while (i < lines.length) {
                const raw = lines[i];
                const line = raw.trim();

                if (!line || line.startsWith('#') || line.startsWith('//')) {
                    i++;
                    continue;
                }

                if (line.startsWith('atpk-name:')) {
                    pkg.name = this.readScalar(line, 'atpk-name:');
                } else if (line.startsWith('atpk-description:')) {
                    pkg.description = this.readScalar(line, 'atpk-description:');
                } else if (line === '!AUTOMATON') {
                    const parsed = this.parseAutomaton(lines, i + 1);
                    pkg.automata.push(parsed.data);
                    i = parsed.nextIndex - 1;
                }

                i++;
            }

            if (!pkg.name) {
                pkg.name = 'unnamed-package';
            }
            if (!pkg.description) {
                pkg.description = '';
            }

            this.assertUniqueAutomata(pkg.automata);
            return pkg;
        }

        parseAutomaton(lines, startIndex) {
            const automaton = {
                name: null,
                version: null,
                description: null,
                author: null,
                priority: DEFAULT_PRIORITY,
                respondsto: [],
                controls: [],
                dependencies: [],
                code: null
            };

            let i = startIndex;
            let inCode = false;
            const codeLines = [];

            while (i < lines.length) {
                const rawLine = lines[i];
                const line = rawLine.trim();

                if (!inCode && line === '!AUTOMATON') {
                    break;
                }

                if (!inCode && (line === '' || line.startsWith('#') || line.startsWith('//'))) {
                    i++;
                    continue;
                }

                if (line === 'code>') {
                    if (inCode) {
                        throw new Error(`Nested code block detected near line ${i + 1}`);
                    }
                    inCode = true;
                    i++;
                    continue;
                }

                if (line === '<code') {
                    if (!inCode) {
                        throw new Error(`Unexpected <code marker near line ${i + 1}`);
                    }
                    inCode = false;
                    automaton.code = codeLines.join('\n').trimEnd();
                    i++;
                    continue;
                }

                if (inCode) {
                    codeLines.push(rawLine);
                    i++;
                    continue;
                }

                this.parseField(line, automaton);
                i++;
            }

            if (inCode) {
                throw new Error(`Unclosed code block for automaton '${automaton.name || 'unknown'}'`);
            }

            this.validateAutomaton(automaton);
            return { data: automaton, nextIndex: i };
        }

        parseField(line, automaton) {
            if (line.startsWith('name:')) {
                automaton.name = this.readScalar(line, 'name:');
            } else if (line.startsWith('version:')) {
                automaton.version = this.readScalar(line, 'version:');
            } else if (line.startsWith('description:')) {
                automaton.description = this.readScalar(line, 'description:');
            } else if (line.startsWith('author:')) {
                automaton.author = this.readScalar(line, 'author:');
            } else if (line.startsWith('priority:')) {
                const value = Number(this.readScalar(line, 'priority:'));
                automaton.priority = Number.isFinite(value) ? value : DEFAULT_PRIORITY;
            } else if (line.startsWith('respondsto:')) {
                automaton.respondsto = this.readList(line, 'respondsto:');
            } else if (line.startsWith('controls:')) {
                automaton.controls = this.readList(line, 'controls:');
            } else if (line.startsWith('dependencies:')) {
                automaton.dependencies = this.readList(line, 'dependencies:');
            }
        }

        readScalar(line, prefix) {
            return line.slice(prefix.length).trim();
        }

        readList(line, prefix) {
            const value = this.readScalar(line, prefix);
            if (!value) return [];
            return value
                .split(',')
                .map(item => item.trim())
                .filter(Boolean);
        }

        validateAutomaton(automaton) {
            const missing = [];
            if (!automaton.name) missing.push('name');
            if (!automaton.version) missing.push('version');
            if (!automaton.description) missing.push('description');
            if (!automaton.code) missing.push('code');

            if (missing.length) {
                throw new Error(`Missing required fields: ${missing.join(', ')}`);
            }
        }

        assertUniqueAutomata(automata) {
            const seen = new Set();
            for (const def of automata) {
                if (seen.has(def.name)) {
                    throw new Error(`Duplicate automaton name '${def.name}' in ATPK package`);
                }
                seen.add(def.name);
            }
        }
    }

    class AutomatonLoader {
        constructor() {
            this.automata = new Map();
            this.loadedPackages = [];
            this.parser = new ATPKParser();
            this.blacklist = this.readStorageArray(STORAGE_KEYS.blacklist);
        }

        readStorageArray(key) {
            try {
                const raw = localStorage.getItem(key);
                if (!raw) return [];
                const parsed = JSON.parse(raw);
                return Array.isArray(parsed) ? parsed : [];
            } catch (error) {
                this.logSafe('warn', `Storage parse failed for ${key}`, error);
                return [];
            }
        }

        writeStorageArray(key, value) {
            localStorage.setItem(key, JSON.stringify(Array.isArray(value) ? value : []));
        }

        getAutomataUrls() {
            return this.readStorageArray(STORAGE_KEYS.urls);
        }

        setAutomataUrls(urls) {
            this.writeStorageArray(STORAGE_KEYS.urls, urls);
        }

        getBlacklist() {
            return this.readStorageArray(STORAGE_KEYS.blacklist);
        }

        setBlacklist(blacklist) {
            this.writeStorageArray(STORAGE_KEYS.blacklist, blacklist);
            this.blacklist = this.getBlacklist();
        }

        isBlacklisted(automatonName) {
            return this.blacklist.includes(automatonName);
        }

        list() {
            return Array.from(this.automata.keys());
        }

        info(name) {
            const entry = this.automata.get(name);
            if (!entry) return null;

            return {
                name,
                version: entry.metadata.version,
                description: entry.metadata.description,
                author: entry.metadata.author,
                priority: entry.metadata.priority,
                respondsto: entry.metadata.respondsto,
                controls: entry.metadata.controls,
                dependencies: entry.metadata.dependencies,
                sourceUrl: entry.sourceUrl,
                status: 'running'
            };
        }

        listAll() {
            return this.list().map(name => this.info(name));
        }

        shutdown(name) {
            const entry = this.automata.get(name);
            if (!entry) {
                console.warn(`Automaton ${name} not found`);
                return false;
            }

            try {
                if (typeof entry.instance.teardown === 'function') {
                    entry.instance.teardown();
                }

                this.unregisterAutomaton(name);
                this.emitSafe('automaton_unloaded', { name, reason: 'shutdown' });
                this.logSafe('info', `Automaton shutdown: ${name}`);
                return true;
            } catch (error) {
                console.error(`Error shutting down ${name}:`, error);
                this.logSafe('error', `Failed to shutdown ${name}:`, error);
                return false;
            }
        }

        kill(name) {
            const entry = this.automata.get(name);
            if (!entry) {
                console.warn(`Automaton ${name} not found`);
                return false;
            }

            try {
                this.unregisterAutomaton(name);
                this.emitSafe('automaton_unloaded', { name, reason: 'killed' });
                this.logSafe('warn', `Automaton killed: ${name}`);
                return true;
            } catch (error) {
                console.error(`Error killing ${name}:`, error);
                this.logSafe('error', `Failed to kill ${name}:`, error);
                return false;
            }
        }

        async restart(name) {
            const entry = this.automata.get(name);
            if (!entry) {
                console.warn(`Automaton ${name} not found`);
                return false;
            }

            this.logSafe('info', `Restarting automaton: ${name}`);

            const metadata = entry.metadata;
            const sourceUrl = entry.sourceUrl;
            const didShutdown = this.shutdown(name);
            if (!didShutdown) return false;

            await this.wait(100);
            await this.loadAutomaton(metadata, sourceUrl);
            this.logSafe('info', `Automaton restarted: ${name}`);
            return this.automata.has(name);
        }

        async loadAll() {
            const urls = this.getAutomataUrls();
            if (urls.length === 0) {
                this.logSafe('warn', 'No automata URLs configured. Add URLs in settings.');
                return;
            }

            for (const url of urls) {
                try {
                    await this.loadPackage(url);
                } catch (error) {
                    console.error(`Failed to load package from ${url}:`, error);
                    this.logSafe('error', `Failed to load package from ${url}:`, error);
                }
            }

            this.logSafe('info', `Loaded ${this.automata.size} automata from ${this.loadedPackages.length} packages`);
        }

        async loadPackage(url) {
            try {
                this.loadscreenSafe(`Loading ${url}...`);
                this.logSafe('info', `Loading package: ${url}`);

                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                const content = await response.text();
                const packageData = this.parser.parse(content);
                const sortedAutomata = this.sortAutomata(packageData.automata);

                let loadedCount = 0;
                for (const def of sortedAutomata) {
                    if (this.isBlacklisted(def.name)) {
                        this.logSafe('info', `Skipping blacklisted automaton: ${def.name}`);
                        continue;
                    }

                    await this.loadAutomaton(def, url);
                    if (this.automata.has(def.name)) {
                        loadedCount += 1;
                    }
                }

                this.loadedPackages.push({
                    url,
                    packageName: packageData.name,
                    automata: loadedCount
                });

                this.logSafe(
                    'info',
                    `Package loaded: ${url} (${loadedCount}/${packageData.automata.length} automata)`
                );

                return loadedCount;
            } catch (error) {
                console.error(`Failed to load package ${url}:`, error);
                this.logSafe('error', `Failed to load package ${url}`, error);
                this.emitSafe('error_occurred', {
                    error,
                    message: error.message,
                    stack: error.stack,
                    source: `package:${url}`,
                    severity: 'error'
                });
                throw error;
            }
        }

        sortAutomata(automata) {
            const byName = new Map(automata.map(def => [def.name, def]));
            const visiting = new Set();
            const visited = new Set();
            const sorted = [];

            const visit = (def) => {
                if (visited.has(def.name)) return;
                if (visiting.has(def.name)) {
                    throw new Error(`Dependency cycle detected at '${def.name}'`);
                }

                visiting.add(def.name);

                const dependencies = Array.isArray(def.dependencies) ? def.dependencies : [];
                for (const depName of dependencies) {
                    const dep = byName.get(depName);
                    if (!dep) {
                        this.logSafe('warn', `Dependency not found: ${depName} for ${def.name}`);
                        continue;
                    }
                    visit(dep);
                }

                visiting.delete(def.name);
                visited.add(def.name);
                sorted.push(def);
            };

            const ordered = [...automata].sort((a, b) => {
                const priorityDelta = (a.priority || DEFAULT_PRIORITY) - (b.priority || DEFAULT_PRIORITY);
                if (priorityDelta !== 0) return priorityDelta;
                return a.name.localeCompare(b.name);
            });

            for (const def of ordered) {
                visit(def);
            }

            return sorted;
        }

        async loadAutomaton(def, sourceUrl) {
            try {
                this.loadscreenSafe(`Loading ${def.name}...`);
                this.logSafe('info', `Loading: ${def.name} v${def.version}`);

                if (def.respondsto?.length) {
                    this.logSafe('info', `  Responds to: ${def.respondsto.join(', ')}`);
                }
                if (def.controls?.length) {
                    this.logSafe('info', `  Controls: ${def.controls.join(', ')}`);
                }

                if (this.automata.has(def.name)) {
                    this.logSafe('warn', `Automaton '${def.name}' already exists, replacing existing instance`);
                    this.shutdown(def.name);
                }

                const automaton = this.executeCode(def.code, def.name);
                this.validateAutomatonObject(automaton, def.name);

                this.automata.set(def.name, {
                    instance: automaton,
                    metadata: def,
                    sourceUrl
                });

                if (typeof AKARI !== 'undefined' && AKARI?.automata?._registry) {
                    AKARI.automata._registry.set(def.name, automaton);
                }

                if (typeof automaton.setup === 'function') {
                    await automaton.setup();
                }

                this.emitSafe('automaton_loaded', {
                    name: def.name,
                    version: def.version,
                    respondsto: def.respondsto || [],
                    controls: def.controls || []
                });
            } catch (error) {
                console.error(`Failed to load automaton ${def.name}:`, error);
                this.logSafe('error', `Failed to load automaton ${def.name}:`, error);
                this.emitSafe('error_occurred', {
                    error,
                    message: error.message,
                    stack: error.stack,
                    source: `automaton:${def.name}`,
                    severity: 'error'
                });
            }
        }

        executeCode(code, automatonName) {
            try {
                const factory = new Function(
                    'globalThis',
                    `'use strict';\n` +
                        `var exports = {};\n` +
                        `var module = { exports: exports };\n` +
                        `${code}\n` +
                        `return module.exports.default || module.exports;`
                );

                return factory(globalThis);
            } catch (error) {
                console.error(`Code execution error in ${automatonName}:`, error);
                this.logSafe('error', `Code execution error in ${automatonName}:`, error);
                throw error;
            }
        }

        validateAutomatonObject(automaton, name) {
            if (!automaton || typeof automaton !== 'object') {
                throw new Error(`Automaton '${name}' did not export an object`);
            }
        }

        getConflicts() {
            const controlsMap = new Map();
            const conflicts = [];

            for (const [name, entry] of this.automata.entries()) {
                const controls = entry.metadata.controls || [];
                for (const control of controls) {
                    if (!controlsMap.has(control)) controlsMap.set(control, []);
                    controlsMap.get(control).push(name);
                }
            }

            for (const [control, owners] of controlsMap.entries()) {
                if (owners.length < 2) continue;
                conflicts.push({
                    control,
                    automata: owners,
                    priorities: owners.map(owner => this.automata.get(owner)?.metadata?.priority ?? DEFAULT_PRIORITY)
                });
            }

            return conflicts;
        }

        unregisterAutomaton(name) {
            this.automata.delete(name);
            if (typeof AKARI !== 'undefined' && AKARI?.automata?._registry) {
                AKARI.automata._registry.delete(name);
            }
        }

        emitSafe(eventName, payload) {
            if (typeof emit === 'function') {
                emit(eventName, payload);
            }
        }

        logSafe(level, message, extra) {
            if (typeof log === 'function') {
                log(level, message, extra);
            }
        }

        loadscreenSafe(message) {
            if (typeof loadscreen === 'function') {
                loadscreen(message);
            }
        }

        wait(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }
    }

    window.ATPKParser = ATPKParser;
    window.AutomatonLoader = AutomatonLoader;
})();
