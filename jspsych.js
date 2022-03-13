class KeyboardListenerAPI {
    constructor(getRootElement, areResponsesCaseSensitive = false, minimumValidRt = 0) {
        this.getRootElement = getRootElement;
        this.areResponsesCaseSensitive = areResponsesCaseSensitive;
        this.minimumValidRt = minimumValidRt;
        this.listeners = new Set();
        this.heldKeys = new Set();
        this.areRootListenersRegistered = false;
        Utils.autoBind(this);
        this.registerRootListeners();
    }
    registerRootListeners() {
        if (!this.areRootListenersRegistered) {
            const rootElement = this.getRootElement();
            if (rootElement) {
                rootElement.addEventListener("keydown", this.rootKeydownListener);
                rootElement.addEventListener("keyup", this.rootKeyupListener);
                this.areRootListenersRegistered = true;
            }
        }
    }
    rootKeydownListener(e) {
        // Iterate over a static copy of the listeners set because listeners might add other listeners
        // that we do not want to be included in the loop
        for (const listener of Array.from(this.listeners)) {
            listener(e);
        }
        this.heldKeys.add(this.toLowerCaseIfInsensitive(e.key));
    }
    toLowerCaseIfInsensitive(string) {
        return this.areResponsesCaseSensitive ? string : string.toLowerCase();
    }
    rootKeyupListener(e) {
        this.heldKeys.delete(this.toLowerCaseIfInsensitive(e.key));
    }
    isResponseValid(validResponses, allowHeldKey, key) {
        // check if key was already held down
        if (!allowHeldKey && this.heldKeys.has(key)) {
            return false;
        }
        if (validResponses === "ALL_KEYS") {
            return true;
        }
        if (validResponses === "NO_KEYS") {
            return false;
        }
        return validResponses.includes(key);
    }
    getKeyboardResponse({ callback_function, valid_responses = "ALL_KEYS", rt_method = "performance", persist, audio_context, audio_context_start_time, allow_held_key = false, minimum_valid_rt = this.minimumValidRt, }) {
        if (rt_method !== "performance" && rt_method !== "audio") {
            console.log('Invalid RT method specified in getKeyboardResponse. Defaulting to "performance" method.');
            rt_method = "performance";
        }
        const usePerformanceRt = rt_method === "performance";
        const startTime = usePerformanceRt ? performance.now() : audio_context_start_time * 1000;
        this.registerRootListeners();
        if (!this.areResponsesCaseSensitive && typeof valid_responses !== "string") {
            valid_responses = valid_responses.map((r) => r.toLowerCase());
        }
        const listener = (e) => {
            const rt = Math.round((rt_method == "performance" ? performance.now() : audio_context.currentTime * 1000) -
                startTime);
            if (rt < minimum_valid_rt) {
                return;
            }
            const key = this.toLowerCaseIfInsensitive(e.key);
            if (this.isResponseValid(valid_responses, allow_held_key, key)) {
                // if this is a valid response, then we don't want the key event to trigger other actions
                // like scrolling via the spacebar.
                e.preventDefault();
                if (!persist) {
                    // remove keyboard listener if it exists
                    this.cancelKeyboardResponse(listener);
                }
                callback_function({ key, rt });
            }
        };
        this.listeners.add(listener);
        return listener;
    }
    cancelKeyboardResponse(listener) {
        // remove the listener from the set of listeners if it is contained
        this.listeners.delete(listener);
    }
    cancelAllKeyboardResponses() {
        this.listeners.clear();
    }
    compareKeys(key1, key2) {
        if ((typeof key1 !== "string" && key1 !== null) ||
            (typeof key2 !== "string" && key2 !== null)) {
            console.error("Error in jsPsych.pluginAPI.compareKeys: arguments must be key strings or null.");
            return undefined;
        }
        if (typeof key1 === "string" && typeof key2 === "string") {
            // if both values are strings, then check whether or not letter case should be converted before comparing (case_sensitive_responses in initJsPsych)
            return this.areResponsesCaseSensitive
                ? key1 === key2
                : key1.toLowerCase() === key2.toLowerCase();
        }
        return key1 === null && key2 === null;
    }
}

class TimeoutAPI {
    constructor() {
        this.timeout_handlers = [];
    }
    setTimeout(callback, delay) {
        const handle = window.setTimeout(callback, delay);
        this.timeout_handlers.push(handle);
        return handle;
    }
    clearAllTimeouts() {
        for (const handler of this.timeout_handlers) {
            clearTimeout(handler);
        }
        this.timeout_handlers = [];
    }
}

class MediaAPI {
    constructor(useWebaudio, webaudioContext) {
        this.useWebaudio = useWebaudio;
        this.webaudioContext = webaudioContext;
        // video //
        this.video_buffers = {};
        // audio //
        this.context = null;
        this.audio_buffers = [];
        // preloading stimuli //
        this.preload_requests = [];
        this.img_cache = {};
        this.preloadMap = new Map();
        this.microphone_recorder = null;
    }
    getVideoBuffer(videoID) {
        return this.video_buffers[videoID];
    }
    initAudio() {
        this.context = this.useWebaudio ? this.webaudioContext : null;
    }
    audioContext() {
        if (this.context !== null) {
            if (this.context.state !== "running") {
                this.context.resume();
            }
        }
        return this.context;
    }
    getAudioBuffer(audioID) {
        return new Promise((resolve, reject) => {
            // check whether audio file already preloaded
            if (typeof this.audio_buffers[audioID] == "undefined" ||
                this.audio_buffers[audioID] == "tmp") {
                // if audio is not already loaded, try to load it
                this.preloadAudio([audioID], () => {
                    resolve(this.audio_buffers[audioID]);
                }, () => { }, (e) => {
                    reject(e.error);
                });
            }
            else {
                // audio is already loaded
                resolve(this.audio_buffers[audioID]);
            }
        });
    }
    preloadAudio(files, callback_complete = () => { }, callback_load = (filepath) => { }, callback_error = (error_msg) => { }) {
        files = Utils.unique(files.flat());
        let n_loaded = 0;
        if (files.length == 0) {
            callback_complete();
            return;
        }
        const load_audio_file_webaudio = (source, count = 1) => {
            const request = new XMLHttpRequest();
            request.open("GET", source, true);
            request.responseType = "arraybuffer";
            request.onload = () => {
                this.context.decodeAudioData(request.response, (buffer) => {
                    this.audio_buffers[source] = buffer;
                    n_loaded++;
                    callback_load(source);
                    if (n_loaded == files.length) {
                        callback_complete();
                    }
                }, (e) => {
                    callback_error({ source: source, error: e });
                });
            };
            request.onerror = function (e) {
                let err = e;
                if (this.status == 404) {
                    err = "404";
                }
                callback_error({ source: source, error: err });
            };
            request.onloadend = function (e) {
                if (this.status == 404) {
                    callback_error({ source: source, error: "404" });
                }
            };
            request.send();
            this.preload_requests.push(request);
        };
        const load_audio_file_html5audio = (source, count = 1) => {
            const audio = new Audio();
            const handleCanPlayThrough = () => {
                this.audio_buffers[source] = audio;
                n_loaded++;
                callback_load(source);
                if (n_loaded == files.length) {
                    callback_complete();
                }
                audio.removeEventListener("canplaythrough", handleCanPlayThrough);
            };
            audio.addEventListener("canplaythrough", handleCanPlayThrough);
            audio.addEventListener("error", function handleError(e) {
                callback_error({ source: audio.src, error: e });
                audio.removeEventListener("error", handleError);
            });
            audio.addEventListener("abort", function handleAbort(e) {
                callback_error({ source: audio.src, error: e });
                audio.removeEventListener("abort", handleAbort);
            });
            audio.src = source;
            this.preload_requests.push(audio);
        };
        for (const file of files) {
            if (typeof this.audio_buffers[file] !== "undefined") {
                n_loaded++;
                callback_load(file);
                if (n_loaded == files.length) {
                    callback_complete();
                }
            }
            else {
                this.audio_buffers[file] = "tmp";
                if (this.audioContext() !== null) {
                    load_audio_file_webaudio(file);
                }
                else {
                    load_audio_file_html5audio(file);
                }
            }
        }
    }
    preloadImages(images, callback_complete = () => { }, callback_load = (filepath) => { }, callback_error = (error_msg) => { }) {
        // flatten the images array
        images = Utils.unique(images.flat());
        var n_loaded = 0;
        if (images.length === 0) {
            callback_complete();
            return;
        }
        for (var i = 0; i < images.length; i++) {
            var img = new Image();
            img.onload = function () {
                n_loaded++;
                callback_load(img.src);
                if (n_loaded === images.length) {
                    callback_complete();
                }
            };
            img.onerror = function (e) {
                callback_error({ source: img.src, error: e });
            };
            img.src = images[i];
            this.img_cache[images[i]] = img;
            this.preload_requests.push(img);
        }
    }
    preloadVideo(videos, callback_complete = () => { }, callback_load = (filepath) => { }, callback_error = (error_msg) => { }) {
        // flatten the video array
        videos = Utils.unique(videos.flat());
        let n_loaded = 0;
        if (videos.length === 0) {
            callback_complete();
            return;
        }
        for (const video of videos) {
            const video_buffers = this.video_buffers;
            //based on option 4 here: http://dinbror.dk/blog/how-to-preload-entire-html5-video-before-play-solved/
            const request = new XMLHttpRequest();
            request.open("GET", video, true);
            request.responseType = "blob";
            request.onload = function () {
                if (this.status === 200 || this.status === 0) {
                    const videoBlob = this.response;
                    video_buffers[video] = URL.createObjectURL(videoBlob); // IE10+
                    n_loaded++;
                    callback_load(video);
                    if (n_loaded === videos.length) {
                        callback_complete();
                    }
                }
            };
            request.onerror = function (e) {
                let err = e;
                if (this.status == 404) {
                    err = "404";
                }
                callback_error({ source: video, error: err });
            };
            request.onloadend = function (e) {
                if (this.status == 404) {
                    callback_error({ source: video, error: "404" });
                }
            };
            request.send();
            this.preload_requests.push(request);
        }
    }
    getAutoPreloadList(timeline_description) {
        const preloadParameterTypes = [
            jsPsych.ParameterType.AUDIO,
            jsPsych.ParameterType.IMAGE,
            jsPsych.ParameterType.VIDEO,
        ];
        /** Map each preload parameter type to a set of paths to be preloaded */
        const preloadPaths = Object.fromEntries(preloadParameterTypes.map((type) => [type, new Set()]));
        const traverseTimeline = (node, inheritedTrialType) => {
            var _a, _b, _c, _d;
            const isTimeline = typeof node.timeline !== "undefined";
            if (isTimeline) {
                for (const childNode of node.timeline) {
                    traverseTimeline(childNode, (_a = node.type) !== null && _a !== void 0 ? _a : inheritedTrialType);
                }
            }
            else if ((_c = ((_b = node.type) !== null && _b !== void 0 ? _b : inheritedTrialType)) === null || _c === void 0 ? void 0 : _c.info) {
                // node is a trial with type.info set
                // Get the plugin name and parameters object from the info object
                const { name: pluginName, parameters } = ((_d = node.type) !== null && _d !== void 0 ? _d : inheritedTrialType).info;
                // Extract parameters to be preloaded and their types from parameter info if this has not
                // yet been done for `pluginName`
                if (!this.preloadMap.has(pluginName)) {
                    this.preloadMap.set(pluginName, Object.fromEntries(Object.entries(parameters)
                        // Filter out parameter entries with media types and a non-false `preload` option
                        .filter(([_name, { type, preload }]) => preloadParameterTypes.includes(type) && (preload !== null && preload !== void 0 ? preload : true))
                        // Map each entry's value to its parameter type
                        .map(([name, { type }]) => [name, type])));
                }
                // Add preload paths from this trial
                for (const [parameterName, parameterType] of Object.entries(this.preloadMap.get(pluginName))) {
                    const parameterValue = node[parameterName];
                    const elements = preloadPaths[parameterType];
                    if (typeof parameterValue === "string") {
                        elements.add(parameterValue);
                    }
                    else if (Array.isArray(parameterValue)) {
                        for (const element of parameterValue.flat()) {
                            if (typeof element === "string") {
                                elements.add(element);
                            }
                        }
                    }
                }
            }
        };
        traverseTimeline({ timeline: timeline_description });
        return {
            images: [...preloadPaths[jsPsych.ParameterType.IMAGE]],
            audio: [...preloadPaths[jsPsych.ParameterType.AUDIO]],
            video: [...preloadPaths[jsPsych.ParameterType.VIDEO]],
        };
    }
    cancelPreloads() {
        for (const request of this.preload_requests) {
            request.onload = () => { };
            request.onerror = () => { };
            request.oncanplaythrough = () => { };
            request.onabort = () => { };
        }
        this.preload_requests = [];
    }
    initializeMicrophoneRecorder(stream) {
        const recorder = new MediaRecorder(stream);
        this.microphone_recorder = recorder;
    }
    getMicrophoneRecorder() {
        return this.microphone_recorder;
    }
}

class SimulationAPI {
    dispatchEvent(event) {
        document.body.dispatchEvent(event);
    }
    /**
     * Dispatches a `keydown` event for the specified key
     * @param key Character code (`.key` property) for the key to press.
     */
    keyDown(key) {
        this.dispatchEvent(new KeyboardEvent("keydown", { key }));
    }
    /**
     * Dispatches a `keyup` event for the specified key
     * @param key Character code (`.key` property) for the key to press.
     */
    keyUp(key) {
        this.dispatchEvent(new KeyboardEvent("keyup", { key }));
    }
    /**
     * Dispatches a `keydown` and `keyup` event in sequence to simulate pressing a key.
     * @param key Character code (`.key` property) for the key to press.
     * @param delay Length of time to wait (ms) before executing action
     */
    pressKey(key, delay = 0) {
        if (delay > 0) {
            setTimeout(() => {
                this.keyDown(key);
                this.keyUp(key);
            }, delay);
        }
        else {
            this.keyDown(key);
            this.keyUp(key);
        }
    }
    /**
     * Dispatches `mousedown`, `mouseup`, and `click` events on the target element
     * @param target The element to click
     * @param delay Length of time to wait (ms) before executing action
     */
    clickTarget(target, delay = 0) {
        if (delay > 0) {
            setTimeout(() => {
                target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
                target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
                target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            }, delay);
        }
        else {
            target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
            target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
            target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        }
    }
    /**
     * Sets the value of a target text input
     * @param target A text input element to fill in
     * @param text Text to input
     * @param delay Length of time to wait (ms) before executing action
     */
    fillTextInput(target, text, delay = 0) {
        if (delay > 0) {
            setTimeout(() => {
                target.value = text;
            }, delay);
        }
        else {
            target.value = text;
        }
    }
    /**
     * Picks a valid key from `choices`, taking into account jsPsych-specific
     * identifiers like "NO_KEYS" and "ALL_KEYS".
     * @param choices Which keys are valid.
     * @returns A key selected at random from the valid keys.
     */
    getValidKey(choices) {
        const possible_keys = [
            "a",
            "b",
            "c",
            "d",
            "e",
            "f",
            "g",
            "h",
            "i",
            "j",
            "k",
            "l",
            "m",
            "n",
            "o",
            "p",
            "q",
            "r",
            "s",
            "t",
            "u",
            "v",
            "w",
            "x",
            "y",
            "z",
            "0",
            "1",
            "2",
            "3",
            "4",
            "5",
            "6",
            "7",
            "8",
            "9",
            " ",
        ];
        let key;
        if (choices == "NO_KEYS") {
            key = null;
        }
        else if (choices == "ALL_KEYS") {
            key = possible_keys[Math.floor(Math.random() * possible_keys.length)];
        }
        else {
            const flat_choices = choices.flat();
            key = flat_choices[Math.floor(Math.random() * flat_choices.length)];
        }
        return key;
    }
    mergeSimulationData(default_data, simulation_options) {
        // override any data with data from simulation object
        return Object.assign(Object.assign({}, default_data), simulation_options === null || simulation_options === void 0 ? void 0 : simulation_options.data);
    }
    ensureSimulationDataConsistency(trial, data) {
        // All RTs must be rounded
        if (data.rt) {
            data.rt = Math.round(data.rt);
        }
        // If a trial_duration and rt exist, make sure that the RT is not longer than the trial.
        if (trial.trial_duration && data.rt && data.rt > trial.trial_duration) {
            data.rt = null;
            if (data.response) {
                data.response = null;
            }
            if (data.correct) {
                data.correct = false;
            }
        }
        // If trial.choices is NO_KEYS make sure that response and RT are null
        if (trial.choices && trial.choices == "NO_KEYS") {
            if (data.rt) {
                data.rt = null;
            }
            if (data.response) {
                data.response = null;
            }
        }
        // If response is not allowed before stimulus display complete, ensure RT
        // is longer than display time.
        if (trial.allow_response_before_complete) {
            if (trial.sequence_reps && trial.frame_time) {
                const min_time = trial.sequence_reps * trial.frame_time * trial.stimuli.length;
                if (data.rt < min_time) {
                    data.rt = null;
                    data.response = null;
                }
            }
        }
    }
}

class HardwareAPI {
    constructor() {
        /**
         * Indicates whether this instance of jspsych has opened a hardware connection through our browser
         * extension
         **/
        this.hardwareConnected = false;
        //it might be useful to open up a line of communication from the extension back to this page
        //script, again, this will have to pass through DOM events. For now speed is of no concern so I
        //will use jQuery
        document.addEventListener("jspsych-activate", (evt) => {
            this.hardwareConnected = true;
        });
    }
    /**
     * Allows communication with user hardware through our custom Google Chrome extension + native C++ program
     * @param		mess	The message to be passed to our extension, see its documentation for the expected members of this object.
     * @author	Daniel Rivas
     *
     */
    hardware(mess) {
        //since Chrome extension content-scripts do not share the javascript environment with the page
        //script that loaded jspsych, we will need to use hacky methods like communicating through DOM
        //events.
        const jspsychEvt = new CustomEvent("jspsych", { detail: mess });
        document.dispatchEvent(jspsychEvt);
        //And voila! it will be the job of the content script injected by the extension to listen for
        //the event and do the appropriate actions.
    }
}

class DataColumn {
    constructor(values = []) {
        this.values = values;
    }
    sum() {
        let s = 0;
        for (const v of this.values) {
            s += v;
        }
        return s;
    }
    mean() {
        return this.sum() / this.count();
    }
    median() {
        if (this.values.length === 0) {
            return undefined;
        }
        const numbers = this.values.slice(0).sort(function (a, b) {
            return a - b;
        });
        const middle = Math.floor(numbers.length / 2);
        const isEven = numbers.length % 2 === 0;
        return isEven ? (numbers[middle] + numbers[middle - 1]) / 2 : numbers[middle];
    }
    min() {
        return Math.min.apply(null, this.values);
    }
    max() {
        return Math.max.apply(null, this.values);
    }
    count() {
        return this.values.length;
    }
    variance() {
        const mean = this.mean();
        let sum_square_error = 0;
        for (const x of this.values) {
            sum_square_error += Math.pow(x - mean, 2);
        }
        const mse = sum_square_error / (this.values.length - 1);
        return mse;
    }
    sd() {
        const mse = this.variance();
        const rmse = Math.sqrt(mse);
        return rmse;
    }
    frequencies() {
        const unique = {};
        for (const x of this.values) {
            if (typeof unique[x] === "undefined") {
                unique[x] = 1;
            }
            else {
                unique[x]++;
            }
        }
        return unique;
    }
    all(eval_fn) {
        for (const x of this.values) {
            if (!eval_fn(x)) {
                return false;
            }
        }
        return true;
    }
}

class DataCollection {
    // private function to save text file on local drive
    #saveTextToFile(textstr, filename) {
        const blobToSave = new Blob([textstr], {
            type: "text/plain",
        });
        let blobURL = "";
        if (typeof window.webkitURL !== "undefined") {
            blobURL = window.webkitURL.createObjectURL(blobToSave);
        }
        else {
            blobURL = window.URL.createObjectURL(blobToSave);
        }
        const link = document.createElement("a");
        link.id = "jsPsych-download-as-text-link";
        link.style.display = "none";
        link.download = filename;
        link.href = blobURL;
        link.click();
    }
    // this function based on code suggested by StackOverflow users:
    // http://stackoverflow.com/users/64741/zachary
    // http://stackoverflow.com/users/317/joseph-sturtevant
    #JSON2CSV(objArray) {
        const array = typeof objArray != "object" ? JSON.parse(objArray) : objArray;
        let line = "";
        let result = "";
        const columns = [];
        for (const row of array) {
            for (const key in row) {
                let keyString = key + "";
                keyString = '"' + keyString.replace(/"/g, '""') + '",';
                if (!columns.includes(key)) {
                    columns.push(key);
                    line += keyString;
                }
            }
        }
        line = line.slice(0, -1); // removes last comma
        result += line + "\r\n";
        for (const row of array) {
            line = "";
            for (const col of columns) {
                let value = typeof row[col] === "undefined" ? "" : row[col];
                if (typeof value == "object") {
                    value = JSON.stringify(value);
                }
                const valueString = value + "";
                line += '"' + valueString.replace(/"/g, '""') + '",';
            }
            line = line.slice(0, -1);
            result += line + "\r\n";
        }
        return result;
    }
    constructor(data = []) {
        this.trials = data;
    }
    push(new_data) {
        this.trials.push(new_data);
        return this;
    }
    join(other_data_collection) {
        this.trials = this.trials.concat(other_data_collection.values());
        return this;
    }
    top() {
        if (this.trials.length <= 1) {
            return this;
        }
        else {
            return new DataCollection([this.trials[this.trials.length - 1]]);
        }
    }
    /**
     * Queries the first n elements in a collection of trials.
     *
     * @param n A positive integer of elements to return. A value of
     *          n that is less than 1 will throw an error.
     *
     * @return First n objects of a collection of trials. If fewer than
     *         n trials are available, the trials.length elements will
     *         be returned.
     *
     */
    first(n = 1) {
        if (n < 1) {
            throw `You must query with a positive nonzero integer. Please use a
               different value for n.`;
        }
        if (this.trials.length === 0)
            return new DataCollection();
        if (n > this.trials.length)
            n = this.trials.length;
        return new DataCollection(this.trials.slice(0, n));
    }
    /**
     * Queries the last n elements in a collection of trials.
     *
     * @param n A positive integer of elements to return. A value of
     *          n that is less than 1 will throw an error.
     *
     * @return Last n objects of a collection of trials. If fewer than
     *         n trials are available, the trials.length elements will
     *         be returned.
     *
     */
    last(n = 1) {
        if (n < 1) {
            throw `You must query with a positive nonzero integer. Please use a
               different value for n.`;
        }
        if (this.trials.length === 0)
            return new DataCollection();
        if (n > this.trials.length)
            n = this.trials.length;
        return new DataCollection(this.trials.slice(this.trials.length - n, this.trials.length));
    }
    values() {
        return this.trials;
    }
    count() {
        return this.trials.length;
    }
    readOnly() {
        return new DataCollection(Utils.deepCopy(this.trials));
    }
    addToAll(properties) {
        for (const trial of this.trials) {
            Object.assign(trial, properties);
        }
        return this;
    }
    addToLast(properties) {
        if (this.trials.length != 0) {
            Object.assign(this.trials[this.trials.length - 1], properties);
        }
        return this;
    }
    filter(filters) {
        // [{p1: v1, p2:v2}, {p1:v2}]
        // {p1: v1}
        let f;
        if (!Array.isArray(filters)) {
            f = Utils.deepCopy([filters]);
        }
        else {
            f = Utils.deepCopy(filters);
        }
        const filtered_data = [];
        for (const trial of this.trials) {
            let keep = false;
            for (const filter of f) {
                let match = true;
                for (const key of Object.keys(filter)) {
                    if (typeof trial[key] !== "undefined" && trial[key] === filter[key]);
                    else {
                        match = false;
                    }
                }
                if (match) {
                    keep = true;
                    break;
                } // can break because each filter is OR.
            }
            if (keep) {
                filtered_data.push(trial);
            }
        }
        return new DataCollection(filtered_data);
    }
    filterCustom(fn) {
        return new DataCollection(this.trials.filter(fn));
    }
    filterColumns(columns) {
        let keys = typeof columns !== "undefined" ? columns : [];
        if (keys.length < 1) {
            return DataCollection(trials);
        } else {
            var new_trials = [];
            for (var i in trials) {
                var new_trial = {};
                keys.forEach(function (key) {
                    new_trial[key] = trials[i][key];
                })
                new_trials.push(new_trial);
            }
            return DataCollection(new_trials);
        }

    }
    ignore(columns) {
        if (!Array.isArray(columns)) {
            columns = [columns];
        }
        const o = Utils.deepCopy(this.trials);
        for (const trial of o) {
            for (const delete_key of columns) {
                delete trial[delete_key];
            }
        }
        return new DataCollection(o);
    }
    uniqueNames() {
        const names = [];
        for (const trial of this.trials) {
            for (const key of Object.keys(trial)) {
                if (!names.includes(key)) {
                    names.push(key);
                }
            }
        }
        return names;
    }
    csv() {
        return this.#JSON2CSV(this.trials);
    }
    json(pretty = false) {
        if (pretty) {
            return JSON.stringify(this.trials, null, "\t");
        }
        return JSON.stringify(this.trials);
    }
    localSave(format, filename) {
        format = format.toLowerCase();
        let data_string;
        if (format === "json") {
            data_string = this.json();
        }
        else if (format === "csv") {
            data_string = this.csv();
        }
        else {
            throw new Error('Invalid format specified for localSave. Must be "json" or "csv".');
        }
        this.#saveTextToFile(data_string, filename);
    }
    select(column) {
        const values = [];
        for (const trial of this.trials) {
            if (typeof trial[column] !== "undefined") {
                values.push(trial[column]);
            }
        }
        return new DataColumn(values);
    }
}

class TimelineNode {
    // constructor
    constructor(jsPsych, parameters, parent, relativeID) {
        this.jsPsych = jsPsych;
        // track progress through the node
        this.progress = {
            current_location: -1,
            current_variable_set: 0,
            current_repetition: 0,
            current_iteration: 0,
            done: false,
        };
        // store a link to the parent of this node
        this.parent_node = parent;
        // create the ID for this node
        this.relative_id = typeof parent === "undefined" ? 0 : relativeID;
        // check if there is a timeline parameter
        // if there is, then this node has its own timeline
        if (typeof parameters.timeline !== "undefined") {
            // create timeline properties
            this.timeline_parameters = {
                timeline: [],
                loop_function: parameters.loop_function,
                conditional_function: parameters.conditional_function,
                sample: parameters.sample,
                randomize_order: typeof parameters.randomize_order == "undefined" ? false : parameters.randomize_order,
                repetitions: typeof parameters.repetitions == "undefined" ? 1 : parameters.repetitions,
                timeline_variables: typeof parameters.timeline_variables == "undefined"
                    ? [{}]
                    : parameters.timeline_variables,
                on_timeline_finish: parameters.on_timeline_finish,
                on_timeline_start: parameters.on_timeline_start,
            };
            this.setTimelineVariablesOrder();
            // extract all of the node level data and parameters
            // but remove all of the timeline-level specific information
            // since this will be used to copy things down hierarchically
            var node_data = Object.assign({}, parameters);
            delete node_data.timeline;
            delete node_data.conditional_function;
            delete node_data.loop_function;
            delete node_data.randomize_order;
            delete node_data.repetitions;
            delete node_data.timeline_variables;
            delete node_data.sample;
            delete node_data.on_timeline_start;
            delete node_data.on_timeline_finish;
            this.node_trial_data = node_data; // store for later...
            // create a TimelineNode for each element in the timeline
            for (var i = 0; i < parameters.timeline.length; i++) {
                // merge parameters
                var merged_parameters = Object.assign({}, node_data, parameters.timeline[i]);
                // merge any data from the parent node into child nodes
                if (typeof node_data.data == "object" && typeof parameters.timeline[i].data == "object") {
                    var merged_data = Object.assign({}, node_data.data, parameters.timeline[i].data);
                    merged_parameters.data = merged_data;
                }
                this.timeline_parameters.timeline.push(new TimelineNode(this.jsPsych, merged_parameters, this, i));
            }
        }
        // if there is no timeline parameter, then this node is a trial node
        else {
            // check to see if a valid trial type is defined
            if (typeof parameters.type === "undefined") {
                console.error('Trial level node is missing the "type" parameter. The parameters for the node are: ' +
                    JSON.stringify(parameters));
            }
            // create a deep copy of the parameters for the trial
            this.trial_parameters = Object.assign({}, parameters);
        }
    }
    // recursively get the next trial to run.
    // if this node is a leaf (trial), then return the trial.
    // otherwise, recursively find the next trial in the child timeline.
    trial() {
        if (typeof this.timeline_parameters == "undefined") {
            // returns a clone of the trial_parameters to
            // protect functions.
            return Utils.deepCopy(this.trial_parameters);
        }
        else {
            if (this.progress.current_location >= this.timeline_parameters.timeline.length) {
                return null;
            }
            else {
                return this.timeline_parameters.timeline[this.progress.current_location].trial();
            }
        }
    }
    markCurrentTrialComplete() {
        if (typeof this.timeline_parameters === "undefined") {
            this.progress.done = true;
        }
        else {
            this.timeline_parameters.timeline[this.progress.current_location].markCurrentTrialComplete();
        }
    }
    nextRepetiton() {
        this.setTimelineVariablesOrder();
        this.progress.current_location = -1;
        this.progress.current_variable_set = 0;
        this.progress.current_repetition++;
        for (var i = 0; i < this.timeline_parameters.timeline.length; i++) {
            this.timeline_parameters.timeline[i].reset();
        }
    }
    // set the order for going through the timeline variables array
    setTimelineVariablesOrder() {
        const timeline_parameters = this.timeline_parameters;
        // check to make sure this node has variables
        if (typeof timeline_parameters === "undefined" ||
            typeof timeline_parameters.timeline_variables === "undefined") {
            return;
        }
        var order = [];
        for (var i = 0; i < timeline_parameters.timeline_variables.length; i++) {
            order.push(i);
        }
        if (typeof timeline_parameters.sample !== "undefined") {
            if (timeline_parameters.sample.type == "custom") {
                order = timeline_parameters.sample.fn(order);
            }
            else if (timeline_parameters.sample.type == "with-replacement") {
                order = Random.sampleWithReplacement(order, timeline_parameters.sample.size, timeline_parameters.sample.weights);
            }
            else if (timeline_parameters.sample.type == "without-replacement") {
                order = Random.sampleWithoutReplacement(order, timeline_parameters.sample.size);
            }
            else if (timeline_parameters.sample.type == "fixed-repetitions") {
                order = Random.repeat(order, timeline_parameters.sample.size, false);
            }
            else if (timeline_parameters.sample.type == "alternate-groups") {
                order = Random.shuffleAlternateGroups(timeline_parameters.sample.groups, timeline_parameters.sample.randomize_group_order);
            }
            else {
                console.error('Invalid type in timeline sample parameters. Valid options for type are "custom", "with-replacement", "without-replacement", "fixed-repetitions", and "alternate-groups"');
            }
        }
        if (timeline_parameters.randomize_order) {
            order = Random.shuffle(order);
        }
        this.progress.order = order;
    }
    // next variable set
    nextSet() {
        this.progress.current_location = -1;
        this.progress.current_variable_set++;
        for (var i = 0; i < this.timeline_parameters.timeline.length; i++) {
            this.timeline_parameters.timeline[i].reset();
        }
    }
    // update the current trial node to be completed
    // returns true if the node is complete after advance (all subnodes are also complete)
    // returns false otherwise
    advance() {
        const progress = this.progress;
        const timeline_parameters = this.timeline_parameters;
        const internal = this.jsPsych.internal;
        // first check to see if done
        if (progress.done) {
            return true;
        }
        // if node has not started yet (progress.current_location == -1),
        // then try to start the node.
        if (progress.current_location == -1) {
            // check for on_timeline_start and conditonal function on nodes with timelines
            if (typeof timeline_parameters !== "undefined") {
                // only run the conditional function if this is the first repetition of the timeline when
                // repetitions > 1, and only when on the first variable set
                if (typeof timeline_parameters.conditional_function !== "undefined" &&
                    progress.current_repetition == 0 &&
                    progress.current_variable_set == 0) {
                    internal.call_immediate = true;
                    var conditional_result = timeline_parameters.conditional_function();
                    internal.call_immediate = false;
                    // if the conditional_function() returns false, then the timeline
                    // doesn't run and is marked as complete.
                    if (conditional_result == false) {
                        progress.done = true;
                        return true;
                    }
                }
                // if we reach this point then the node has its own timeline and will start
                // so we need to check if there is an on_timeline_start function if we are on the first variable set
                if (typeof timeline_parameters.on_timeline_start !== "undefined" &&
                    progress.current_variable_set == 0) {
                    timeline_parameters.on_timeline_start();
                }
            }
            // if we reach this point, then either the node doesn't have a timeline of the
            // conditional function returned true and it can start
            progress.current_location = 0;
            // call advance again on this node now that it is pointing to a new location
            return this.advance();
        }
        // if this node has a timeline, propogate down to the current trial.
        if (typeof timeline_parameters !== "undefined") {
            var have_node_to_run = false;
            // keep incrementing the location in the timeline until one of the nodes reached is incomplete
            while (progress.current_location < timeline_parameters.timeline.length &&
                have_node_to_run == false) {
                // check to see if the node currently pointed at is done
                var target_complete = timeline_parameters.timeline[progress.current_location].advance();
                if (!target_complete) {
                    have_node_to_run = true;
                    return false;
                }
                else {
                    progress.current_location++;
                }
            }
            // if we've reached the end of the timeline (which, if the code is here, we have)
            // there are a few steps to see what to do next...
            // first, check the timeline_variables to see if we need to loop through again
            // with a new set of variables
            if (progress.current_variable_set < progress.order.length - 1) {
                // reset the progress of the node to be with the new set
                this.nextSet();
                // then try to advance this node again.
                return this.advance();
            }
            // if we're all done with the timeline_variables, then check to see if there are more repetitions
            else if (progress.current_repetition < timeline_parameters.repetitions - 1) {
                this.nextRepetiton();
                // check to see if there is an on_timeline_finish function
                if (typeof timeline_parameters.on_timeline_finish !== "undefined") {
                    timeline_parameters.on_timeline_finish();
                }
                return this.advance();
            }
            // if we're all done with the repetitions...
            else {
                // check to see if there is an on_timeline_finish function
                if (typeof timeline_parameters.on_timeline_finish !== "undefined") {
                    timeline_parameters.on_timeline_finish();
                }
                // if we're all done with the repetitions, check if there is a loop function.
                if (typeof timeline_parameters.loop_function !== "undefined") {
                    internal.call_immediate = true;
                    if (timeline_parameters.loop_function(this.generatedData())) {
                        this.reset();
                        internal.call_immediate = false;
                        return this.parent_node.advance();
                    }
                    else {
                        progress.done = true;
                        internal.call_immediate = false;
                        return true;
                    }
                }
            }
            // no more loops on this timeline, we're done!
            progress.done = true;
            return true;
        }
    }
    // check the status of the done flag
    isComplete() {
        return this.progress.done;
    }
    // getter method for timeline variables
    getTimelineVariableValue(variable_name) {
        if (typeof this.timeline_parameters == "undefined") {
            return undefined;
        }
        var v = this.timeline_parameters.timeline_variables[this.progress.order[this.progress.current_variable_set]][variable_name];
        return v;
    }
    // recursive upward search for timeline variables
    findTimelineVariable(variable_name) {
        var v = this.getTimelineVariableValue(variable_name);
        if (typeof v == "undefined") {
            if (typeof this.parent_node !== "undefined") {
                return this.parent_node.findTimelineVariable(variable_name);
            }
            else {
                return undefined;
            }
        }
        else {
            return v;
        }
    }
    // recursive downward search for active trial to extract timeline variable
    timelineVariable(variable_name) {
        if (typeof this.timeline_parameters == "undefined") {
            return this.findTimelineVariable(variable_name);
        }
        else {
            // if progress.current_location is -1, then the timeline variable is being evaluated
            // in a function that runs prior to the trial starting, so we should treat that trial
            // as being the active trial for purposes of finding the value of the timeline variable
            var loc = Math.max(0, this.progress.current_location);
            // if loc is greater than the number of elements on this timeline, then the timeline
            // variable is being evaluated in a function that runs after the trial on the timeline
            // are complete but before advancing to the next (like a loop_function).
            // treat the last active trial as the active trial for this purpose.
            if (loc == this.timeline_parameters.timeline.length) {
                loc = loc - 1;
            }
            // now find the variable
            return this.timeline_parameters.timeline[loc].timelineVariable(variable_name);
        }
    }
    // recursively get all the timeline variables for this trial
    allTimelineVariables() {
        var all_tvs = this.allTimelineVariablesNames();
        var all_tvs_vals = {};
        for (var i = 0; i < all_tvs.length; i++) {
            all_tvs_vals[all_tvs[i]] = this.timelineVariable(all_tvs[i]);
        }
        return all_tvs_vals;
    }
    // helper to get all the names at this stage.
    allTimelineVariablesNames(so_far = []) {
        if (typeof this.timeline_parameters !== "undefined") {
            so_far = so_far.concat(Object.keys(this.timeline_parameters.timeline_variables[this.progress.order[this.progress.current_variable_set]]));
            // if progress.current_location is -1, then the timeline variable is being evaluated
            // in a function that runs prior to the trial starting, so we should treat that trial
            // as being the active trial for purposes of finding the value of the timeline variable
            var loc = Math.max(0, this.progress.current_location);
            // if loc is greater than the number of elements on this timeline, then the timeline
            // variable is being evaluated in a function that runs after the trial on the timeline
            // are complete but before advancing to the next (like a loop_function).
            // treat the last active trial as the active trial for this purpose.
            if (loc == this.timeline_parameters.timeline.length) {
                loc = loc - 1;
            }
            // now find the variable
            return this.timeline_parameters.timeline[loc].allTimelineVariablesNames(so_far);
        }
        if (typeof this.timeline_parameters == "undefined") {
            return so_far;
        }
    }
    // recursively get the number of **trials** contained in the timeline
    // assuming that while loops execute exactly once and if conditionals
    // always run
    length() {
        var length = 0;
        if (typeof this.timeline_parameters !== "undefined") {
            for (var i = 0; i < this.timeline_parameters.timeline.length; i++) {
                length += this.timeline_parameters.timeline[i].length();
            }
        }
        else {
            return 1;
        }
        return length;
    }
    // return the percentage of trials completed, grouped at the first child level
    // counts a set of trials as complete when the child node is done
    percentComplete() {
        var total_trials = this.length();
        var completed_trials = 0;
        for (var i = 0; i < this.timeline_parameters.timeline.length; i++) {
            if (this.timeline_parameters.timeline[i].isComplete()) {
                completed_trials += this.timeline_parameters.timeline[i].length();
            }
        }
        return (completed_trials / total_trials) * 100;
    }
    // resets the node and all subnodes to original state
    // but increments the current_iteration counter
    reset() {
        this.progress.current_location = -1;
        this.progress.current_repetition = 0;
        this.progress.current_variable_set = 0;
        this.progress.current_iteration++;
        this.progress.done = false;
        this.setTimelineVariablesOrder();
        if (typeof this.timeline_parameters != "undefined") {
            for (var i = 0; i < this.timeline_parameters.timeline.length; i++) {
                this.timeline_parameters.timeline[i].reset();
            }
        }
    }
    // mark this node as finished
    end() {
        this.progress.done = true;
    }
    // recursively end whatever sub-node is running the current trial
    endActiveNode() {
        if (typeof this.timeline_parameters == "undefined") {
            this.end();
            this.parent_node.end();
        }
        else {
            this.timeline_parameters.timeline[this.progress.current_location].endActiveNode();
        }
    }
    // get a unique ID associated with this node
    // the ID reflects the current iteration through this node.
    ID() {
        var id = "";
        if (typeof this.parent_node == "undefined") {
            return "0." + this.progress.current_iteration;
        }
        else {
            id += this.parent_node.ID() + "-";
            id += this.relative_id + "." + this.progress.current_iteration;
            return id;
        }
    }
    // get the ID of the active trial
    activeID() {
        if (typeof this.timeline_parameters == "undefined") {
            return this.ID();
        }
        else {
            return this.timeline_parameters.timeline[this.progress.current_location].activeID();
        }
    }
    // get all the data generated within this node
    generatedData() {
        return this.jsPsych.data.getDataByTimelineNode(this.ID());
    }
    // get all the trials of a particular type
    trialsOfType(type) {
        if (typeof this.timeline_parameters == "undefined") {
            if (this.trial_parameters.type == type) {
                return this.trial_parameters;
            }
            else {
                return [];
            }
        }
        else {
            var trials = [];
            for (var i = 0; i < this.timeline_parameters.timeline.length; i++) {
                var t = this.timeline_parameters.timeline[i].trialsOfType(type);
                trials = trials.concat(t);
            }
            return trials;
        }
    }
    // add new trials to end of this timeline
    insert(parameters) {
        if (typeof this.timeline_parameters === "undefined") {
            console.error("Cannot add new trials to a trial-level node.");
        }
        else {
            if(this.jsPsych.opts.autoLoadAssets) {
                this.jsPsych.loadPluginsSrc(parameters);
            }
            this.timeline_parameters.timeline.push(new TimelineNode(this.jsPsych, Object.assign(Object.assign({}, this.node_trial_data), parameters), this, this.timeline_parameters.timeline.length));
        }
    }
}

class GitHub {
    constructor(config) {
        this.owner = config["owner"] ? config["owner"] : "";
        this.repo = config["repo"] ? config["repo"] : "";
        this.path = config["path"] ? config["path"] : "";
        this.token = config["token"] ? config["token"] : "";
        if (this.token.length < 1) {
            this.header = {
                "Content-Type": "application/json"
            }
        } else {
            this.header = {
                "Content-Type": "application/json",
                "Authorization": `token ${this.token}`
            }
        }
    }
    getID = function (experID = "", length = 4, suffix = "") {
        let name = `${experID ? experID : ""}`;
        let i = 1;
        while (this.isFileExist(name + i.toString().padStart(length, "0") + suffix + ".csv")) {
            i++
        }
        return i;
    }
    isFileExist = function (fileName) {
        let res = new XMLHttpRequest();
        res.open(
            "GET",
            `https://api.github.com/repos/${this.owner}/${this.repo}/contents${this.path}/${fileName}`,
            false
        )
        for (k in this.header) {
            res.setRequestHeader(k, this.header[k]);
        }
        res.send();
        if (res.status == 200) {
            return true;
        } else {
            return false;
        }
    }
    delete = function (fileName, message) {
        let formd = {
            message: message,
            sha: this.getFileSha(fileName)
        };
        let res = new XMLHttpRequest();
        res.open(
            "DELETE",
            `https://api.github.com/repos/${this.owner}/${this.repo}/contents${this.path}/${fileName}`,
            false
        )
        for (k in this.header) {
            res.setRequestHeader(k, this.header[k]);
        }
        res.send(JSON.stringify(formd));

        if (res.status >= 400) {
            return false;
        } else {
            return true;
        }
    }
    getFileSha = function (fileName) {
        let res = new XMLHttpRequest();
        res.open(
            "GET",
            `https://api.github.com/repos/${this.owner}/${this.repo}/contents${this.path}/${fileName}`,
            false
        );
        for (k in this.header) {
            res.setRequestHeader(k, this.header[k]);
        }
        res.send();
        // console.log(res);
        return JSON.parse(res.responseText)["sha"]
    }
    getLastSha = function () {
        let res = new XMLHttpRequest();
        res.open(
            "GET",
            `https://api.github.com/repos/${this.owner}/${this.repo}/commits`,
            false
        );
        for (k in this.header) {
            res.setRequestHeader(k, this.header[k]);
        }
        res.send();
        return JSON.parse(res.responseText)[0].sha;
    }
    update = function (fileName, message, content) {
        let formd = {
            message: message,
            content: btoa(content),
            sha: this.getFileSha(fileName)
        };
        let res = new XMLHttpRequest();
        res.open(
            "PUT",
            `https://api.github.com/repos/${this.owner}/${this.repo}/contents${this.path}/${fileName}`,
            false
        )
        for (k in this.header) {
            res.setRequestHeader(k, this.header[k]);
        }
        res.send(JSON.stringify(formd));

        if (res.status >= 400) {
            return false;
        } else {
            return true;
        }
    }
    push(fileName, message, content) {
        let formd = {
            message: message,
            content: btoa(content)
        };
        let res = new XMLHttpRequest();
        res.open(
            "PUT",
            `https://api.github.com/repos/${this.owner}/${this.repo}/contents${this.path}/${fileName}`,
            false
        );
        for (k in this.header) {
            res.setRequestHeader(k, this.header[k]);
        }
        res.send(JSON.stringify(formd));

        if (res.status >= 400) {
            return false;
        } else {
            return true;
        }
    }
    upload(fileName, message, content) {
        if (this.isFileExist(fileName)) {
            return this.update(fileName, message, content);
        } else {
            return this.push(fileName, message, content);
        }
    }
}

class Utils {
        /**
         * @param {string} p1 distance from screen
         * @param {number} vAngle viewing angle required for stimulation
         * @param {number} screenPixe actual screen pixels
         * @param {number} screenActual actual screen physical size
         * @param {number} biasAngle degrees off center
         */
    static getPixe(distance, vAngle, screenPixe, screenActual, biasAngle = 0) {
        if (biasAngle == 0) {
            return ((Math.tan(vAngle / 2 * Math.PI / 180) * distance) / screenActual) * screenPixe * 2;
        } else {
            return ((Math.tan((vAngle + biasAngle) * Math.PI / 180) * distance) / screenActual) * screenPixe - ((Math.tan(biasAngle * Math.PI / 180) * distance) / screenActual) * screenPixe;
        }
    }

    static combination(arr, num) {
        var r = [];
        (function f(t, a, n) {
            if (n == 0) return r.push(t);
            for (var i = 0, l = a.length; i <= l - n; i++) {
                f(t.concat(a[i]), a.slice(i + 1), n - 1);	//取a数组的第一个值放入到t中，同时a数组删除取出来的那个值，余下的值用来遍历
            }
        })([], arr, num);
        return r;
    }

    static permutation(arr, num) {
        var r = [];
        (function f(t, a, n) {
            if (n == 0) return r.push(t);
            for (var i = 0, l = a.length; i < l; i++) {
                f(t.concat(a[i]), a.slice(0, i).concat(a.slice(i + 1)), n - 1);
            }
        })([], arr, num);
        return r;
    }
    static getQueryString() {
        const a = window.location.search.substr(1).split("&");
        const b = {};
        for (let i = 0; i < a.length; ++i) {
            const p = a[i].split("=", 2);
            if (p.length == 1)
                b[p[0]] = "";
            else
                b[p[0]] = decodeURIComponent(p[1].replace(/\+/g, " "));
        }
        return b;
    }
    static unique(arr) {
        return [...new Set(arr)];
    }
    static deepCopy(obj) {
        if (!obj)
            return obj;
        let out;
        if (Array.isArray(obj)) {
            out = [];
            for (const x of obj) {
                out.push(Utils.deepCopy(x));
            }
            return out;
        }
        else if (typeof obj === "object" && obj !== null) {
            out = {};
            for (const key in obj) {
                if (obj.hasOwnProperty(key)) {
                    out[key] = Utils.deepCopy(obj[key]);
                }
            }
            return out;
        }
        else {
            return obj;
        }
    }
    static getAllProperties = object => {
        const properties = new Set();

        do {
            for (const key of Reflect.ownKeys(object)) {
                properties.add([object, key]);
            }
        } while ((object = Reflect.getPrototypeOf(object)) && object !== Object.prototype);

        return properties;
    };

    static autoBind = (self, { include, exclude } = {}) => {
        const filter = key => {
            const match = pattern => typeof pattern === 'string' ? key === pattern : pattern.test(key);

            if (include) {
                return include.some(match);
            }

            if (exclude) {
                return !exclude.some(match);
            }

            return true;
        };

        for (const [object, key] of Utils.getAllProperties(self.constructor.prototype)) {
            if (key === 'constructor' || !filter(key)) {
                continue;
            }

            const descriptor = Reflect.getOwnPropertyDescriptor(object, key);
            if (descriptor && typeof descriptor.value === 'function') {
                self[key] = self[key].bind(self);
            }
        }

        return self;
    };
    static __awaiter(thisArg, _arguments, P, generator) {
        function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
        return new (P || (P = Promise))(function (resolve, reject) {
            function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
            function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
            function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
            step((generator = generator.apply(thisArg, _arguments || [])).next());
        });
    }
    static getXmlHttpRequest = function () {
        if (window.XMLHttpRequest) // 除了IE外的其它浏览器
            return new XMLHttpRequest();
        else if (window.ActiveXObject) // IE 
            return new ActiveXObject("MsXml2.XmlHttp");
    }
    //导入内容
    static includeJsText = function (rootObject, jsText) {
        if (rootObject != null) {
            var oScript = document.createElement("script");
            oScript.type = "text/javascript";
            //oScript.id = sId; 
            //oScript.src = fileUrl; 
            //oScript.defer = true; 
            oScript.text = jsText;
            rootObject.appendChild(oScript);
            //alert(oScript.text);
        }
    }
    //导入文件 异步加载
    static includeJsSrc = function (rootObject, fileUrl) {
        if (rootObject != null) {
            var oScript = document.createElement("script");
            oScript.type = "text/javascript";
            oScript.src = fileUrl;
            rootObject.appendChild(oScript);
        }
    }
    //同步加载
    static addJs = function (rootObject, url) {
        var oXmlHttp = Utils.getXmlHttpRequest();
        oXmlHttp.onreadystatechange = function () {//其实当在第二次调用导入js时,因为在浏览器当中存在这个*.js文件了,它就不在访问服务器,也就不在执行这个方法了,这个方法也只有设置成异步时才用到
            if (oXmlHttp.readyState == 4) { //当执行完成以后(返回了响应)所要执行的
                if (oXmlHttp.status == 200 || oXmlHttp.status == 304) { //200有读取对应的url文件,404表示不存在这个文件
                    Utils.includeJsSrc(rootObject, url);
                    // console.log("Load " + url + "JS success")
                } else {
                    console.log('XML request error: ' + oXmlHttp.statusText + ' (' + oXmlHttp.status + ')');
                }
            }
        }
        //1.True 表示脚本会在 send() 方法之后继续执行，而不等待来自服务器的响应,并且在open()方法当中有调用到onreadystatechange()这个方法。通过把该参数设置为 "false"，可以省去额外的 onreadystatechange 代码,它表示服务器返回响应后才执行send()后面的方法.
        //2.同步执行oXmlHttp.send()方法后oXmlHttp.responseText有返回对应的内容,而异步还是为空,只有在oXmlHttp.readyState == 4时才有内容,反正同步的在oXmlHttp.send()后的操作就相当于oXmlHttp.readyState == 4下的操作,它相当于只有了这一种状态.
        oXmlHttp.open('GET', url, false); //url为js文件时,ie会自动生成 '<script src="*.js" type="text/javascript"> </scr ipt>',ff不会 
        oXmlHttp.send(null);
        if(oXmlHttp.status == 200 || oXmlHttp.status == 304) {
            Utils.includeJsText(rootObject, oXmlHttp.responseText);
        }
    }

}

class Data {
    constructor(jsPsych) {
        this.jsPsych = jsPsych;
        // data properties for all trials
        this.dataProperties = {};
        this.reset();
    }
    reset() {
        this.allData = new DataCollection();
        this.interactionData = new DataCollection();
    }
    get() {
        return this.allData;
    }
    getInteractionData() {
        return this.interactionData;
    }
    write(data_object) {
        const progress = this.jsPsych.getProgress();
        const trial = this.jsPsych.getCurrentTrial();
        //var trial_opt_data = typeof trial.data == 'function' ? trial.data() : trial.data;
        const default_data = {
            trial_type: trial.type.info.name,
            trial_index: progress.current_trial_global,
            time_elapsed: this.jsPsych.getTotalTime(),
            internal_node_id: this.jsPsych.getCurrentTimelineNodeID(),
        };
        this.allData.push(Object.assign(Object.assign(Object.assign(Object.assign({}, data_object), trial.data), default_data), this.dataProperties));
    }
    addProperties(properties) {
        // first, add the properties to all data that's already stored
        this.allData.addToAll(properties);
        // now add to list so that it gets appended to all future data
        this.dataProperties = Object.assign({}, this.dataProperties, properties);
    }
    addDataToLastTrial(data) {
        this.allData.addToLast(data);
    }
    getDataByTimelineNode(node_id) {
        return this.allData.filterCustom((x) => x.internal_node_id.slice(0, node_id.length) === node_id);
    }
    getLastTrialData() {
        return this.allData.top();
    }
    getLastTimelineData() {
        const lasttrial = this.getLastTrialData();
        const node_id = lasttrial.select("internal_node_id").values[0];
        if (typeof node_id === "undefined") {
            return new DataCollection();
        }
        else {
            const parent_node_id = node_id.substr(0, node_id.lastIndexOf("-"));
            const lastnodedata = this.getDataByTimelineNode(parent_node_id);
            return lastnodedata;
        }
    }
    displayData(format = "json") {
        format = format.toLowerCase();
        if (format != "json" && format != "csv") {
            console.log("Invalid format declared for displayData function. Using json as default.");
            format = "json";
        }
        const data_string = format === "json" ? this.allData.json(true) : this.allData.csv();
        const display_element = this.jsPsych.getDisplayElement();
        display_element.innerHTML = '<pre id="jsPsych-data-display"></pre>';
        document.getElementById("jsPsych-data-display").textContent = data_string;
    }
    urlVariables() {
        if (typeof this.query_string == "undefined") {
            this.query_string = Utils.getQueryString();
        }
        return this.query_string;
    }
    getURLVariable(whichvar) {
        return this.urlVariables()[whichvar];
    }
    createInteractionListeners() {
        // blur event capture
        window.addEventListener("blur", () => {
            const data = {
                event: "blur",
                trial: this.jsPsych.getProgress().current_trial_global,
                time: this.jsPsych.getTotalTime(),
            };
            this.interactionData.push(data);
            this.jsPsych.getInitSettings().on_interaction_data_update(data);
        });
        // focus event capture
        window.addEventListener("focus", () => {
            const data = {
                event: "focus",
                trial: this.jsPsych.getProgress().current_trial_global,
                time: this.jsPsych.getTotalTime(),
            };
            this.interactionData.push(data);
            this.jsPsych.getInitSettings().on_interaction_data_update(data);
        });
        // fullscreen change capture
        const fullscreenchange = () => {
            const data = {
                event:
                    // @ts-expect-error
                    document.isFullScreen ||
                        // @ts-expect-error
                        document.webkitIsFullScreen ||
                        // @ts-expect-error
                        document.mozIsFullScreen ||
                        document.fullscreenElement
                        ? "fullscreenenter"
                        : "fullscreenexit",
                trial: this.jsPsych.getProgress().current_trial_global,
                time: this.jsPsych.getTotalTime(),
            };
            this.interactionData.push(data);
            this.jsPsych.getInitSettings().on_interaction_data_update(data);
        };
        document.addEventListener("fullscreenchange", fullscreenchange);
        document.addEventListener("mozfullscreenchange", fullscreenchange);
        document.addEventListener("webkitfullscreenchange", fullscreenchange);
    }
}

class Random {
    static randn_bm() {
        var u = 0, v = 0;
        while (u === 0)
            u = Math.random(); //Converting [0,1) to (0,1)
        while (v === 0)
            v = Math.random();
        return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    }
    static unpackArray(array) {
        const out = {};
        for (const x of array) {
            for (const key of Object.keys(x)) {
                if (typeof out[key] === "undefined") {
                    out[key] = [];
                }
                out[key].push(x[key]);
            }
        }
        return out;
    }
    static repeat(array, repetitions, unpack = false) {
        const arr_isArray = Array.isArray(array);
        const rep_isArray = Array.isArray(repetitions);
        // if array is not an array, then we just repeat the item
        if (!arr_isArray) {
            if (!rep_isArray) {
                array = [array];
                repetitions = [repetitions];
            }
            else {
                repetitions = [repetitions[0]];
                console.log("Unclear parameters given to randomization.repeat. Multiple set sizes specified, but only one item exists to sample. Proceeding using the first set size.");
            }
        }
        else {
            // if repetitions is not an array, but array is, then we
            // repeat repetitions for each entry in array
            if (!rep_isArray) {
                let reps = [];
                for (let i = 0; i < array.length; i++) {
                    reps.push(repetitions);
                }
                repetitions = reps;
            }
            else {
                if (array.length != repetitions.length) {
                    console.warn("Unclear parameters given to randomization.repeat. Items and repetitions are unequal lengths. Behavior may not be as expected.");
                    // throw warning if repetitions is too short, use first rep ONLY.
                    if (repetitions.length < array.length) {
                        let reps = [];
                        for (let i = 0; i < array.length; i++) {
                            reps.push(repetitions);
                        }
                        repetitions = reps;
                    }
                    else {
                        // throw warning if too long, and then use the first N
                        repetitions = repetitions.slice(0, array.length);
                    }
                }
            }
        }
        // should be clear at this point to assume that array and repetitions are arrays with == length
        let allsamples = [];
        for (let i = 0; i < array.length; i++) {
            for (let j = 0; j < repetitions[i]; j++) {
                if (array[i] == null || typeof array[i] != "object") {
                    allsamples.push(array[i]);
                }
                else {
                    allsamples.push(Object.assign({}, array[i]));
                }
            }
        }
        let out = this.shuffle(allsamples);
        if (unpack) {
            out = Random.unpackArray(out);
        }
        return out;
    }
    static shuffle(array) {
        if (!Array.isArray(array)) {
            console.error("Argument to shuffle() must be an array.");
        }
        const copy_array = array.slice(0);
        let m = copy_array.length, t, i;
        // While there remain elements to shuffle…
        while (m) {
            // Pick a remaining element…
            i = Math.floor(Math.random() * m--);
            // And swap it with the current element.
            t = copy_array[m];
            copy_array[m] = copy_array[i];
            copy_array[i] = t;
        }
        return copy_array;
    }
    static shuffleNoRepeats(arr, equalityTest) {
        if (!Array.isArray(arr)) {
            console.error('First argument to jsPsych.randomization.shuffleNoRepeats() must be an array.')
        }
        if (typeof equalityTest !== 'undefined' && typeof equalityTest !== 'function') {
            console.error('Second argument to jsPsych.randomization.shuffleNoRepeats() must be a function.')
        }
        // define a default equalityTest
        if (typeof equalityTest == 'undefined') {
            equalityTest = function (a, b) {
                if (JSON.stringify(a) === JSON.stringify(b)) {
                    return true;
                } else {
                    return false;
                }
            }
        }
        // Conversion type
        let list = {};
        arr.forEach((v, i) => {
            list[JSON.stringify(v)] = list[JSON.stringify(v)] ? list[JSON.stringify(v)] + 1 : 1;
        });
        // Start arranging combined data
        let random_shuffle = (function c(arr, re) {
            let max = 0, // Maximum number of repetitions in the array
                sum = 0, // Remove the maximum quantity and the remaining quantity
                sarr = Object.keys(arr);
            if (sarr.length < 1) {
                return re;
            } // if length of the keys in arr less than 1, means 0, then return. because there is no thing left
            for (let i in arr) {
                if (!arr[max] || arr[i] > arr[max]) {
                    max = i;
                }
                sum += arr[i];
            } // result {1:2, 3:3} original [1,1,3,3,3]
            sum -= arr[max];
            let rand_index = (arr[max] - sum >= 1) ? max : sarr[Math.floor(Math.random() * sarr.length)]; // get the value in arr
            if (re.length && equalityTest(JSON.parse(rand_index), JSON.parse(re[re.length - 1]))) { // re is the result, make a judgement
                let tmp = sarr.splice(sarr.indexOf(rand_index), 1)[0]; // 
                rand_index = (sarr.length > 0) ? sarr[Math.floor(Math.random() * sarr.length)] : tmp; //
            }
            re.push(rand_index);
            arr[rand_index] -= 1;
            if (arr[rand_index] < 1) {
                delete arr[rand_index];
            }
            return c(arr, re);
        })(list, []);
        // End
        // Conversion type
        let out = [];
        random_shuffle.forEach(v => {
            out.push(JSON.parse(v));
        });
        return out;
    }
    static shuffleAlternateGroups(arr_groups, random_group_order = false) {
        const n_groups = arr_groups.length;
        if (n_groups == 1) {
            console.warn("shuffleAlternateGroups() was called with only one group. Defaulting to simple shuffle.");
            return this.shuffle(arr_groups[0]);
        }
        let group_order = [];
        for (let i = 0; i < n_groups; i++) {
            group_order.push(i);
        }
        if (random_group_order) {
            group_order = this.shuffle(group_order);
        }
        const randomized_groups = [];
        let min_length = null;
        for (let i = 0; i < n_groups; i++) {
            min_length =
                min_length === null ? arr_groups[i].length : Math.min(min_length, arr_groups[i].length);
            randomized_groups.push(this.shuffle(arr_groups[i]));
        }
        const out = [];
        for (let i = 0; i < min_length; i++) {
            for (let j = 0; j < group_order.length; j++) {
                out.push(randomized_groups[group_order[j]][i]);
            }
        }
        return out;
    }
    static sampleWithoutReplacement(arr, size) {
        if (!Array.isArray(arr)) {
            console.error("First argument to sampleWithoutReplacement() must be an array");
        }
        if (size > arr.length) {
            console.error("Cannot take a sample larger than the size of the set of items to sample.");
        }
        return this.shuffle(arr).slice(0, size);
    }
    static sampleWithReplacement(arr, size, weights) {
        if (!Array.isArray(arr)) {
            console.error("First argument to sampleWithReplacement() must be an array");
        }
        const normalized_weights = [];
        if (typeof weights !== "undefined") {
            if (weights.length !== arr.length) {
                console.error("The length of the weights array must equal the length of the array " +
                    "to be sampled from.");
            }
            let weight_sum = 0;
            for (const weight of weights) {
                weight_sum += weight;
            }
            for (const weight of weights) {
                normalized_weights.push(weight / weight_sum);
            }
        }
        else {
            for (let i = 0; i < arr.length; i++) {
                normalized_weights.push(1 / arr.length);
            }
        }
        const cumulative_weights = [normalized_weights[0]];
        for (let i = 1; i < normalized_weights.length; i++) {
            cumulative_weights.push(normalized_weights[i] + cumulative_weights[i - 1]);
        }
        const samp = [];
        for (let i = 0; i < size; i++) {
            const rnd = Math.random();
            let index = 0;
            while (rnd > cumulative_weights[index]) {
                index++;
            }
            samp.push(arr[index]);
        }
        return samp;
    }
    static factorial(factors, repetitions = 1, unpack = false) {
        let design = [{}];
        for (const [factorName, factor] of Object.entries(factors)) {
            const new_design = [];
            for (const level of factor) {
                for (const cell of design) {
                    new_design.push(Object.assign(Object.assign({}, cell), { [factorName]: level }));
                }
            }
            design = new_design;
        }
        return this.repeat(design, repetitions, unpack);
    }
    static randomID(length = 32) {
        let result = "";
        const chars = "0123456789abcdefghjklmnopqrstuvwxyz";
        for (let i = 0; i < length; i++) {
            result += chars[Math.floor(Math.random() * chars.length)];
        }
        return result;
    }
    static randomInt(lower, upper) {
        if (upper < lower) {
            throw new Error("Upper boundary must be less than or equal to lower boundary");
        }
        return lower + Math.floor(Math.random() * (upper - lower + 1));
    }
    static sampleBernoulli(p) {
        return Math.random() <= p ? 1 : 0;
    }
    static sampleNormal(mean, standard_deviation) {
        return Random.randn_bm() * standard_deviation + mean;
    }
    static sampleExponential(rate) {
        return -Math.log(Math.random()) / rate;
    }
    static sampleExGaussian(mean, standard_deviation, rate, positive = false) {
        let s = this.sampleNormal(mean, standard_deviation) + this.sampleExponential(rate);
        if (positive) {
            while (s <= 0) {
                s = this.sampleNormal(mean, standard_deviation) + this.sampleExponential(rate);
            }
        }
        return s;
    }
    static randomWords(opts) {
        return (function (opts) {
            let wordList = [
                // Borrowed from xkcd password generator which borrowed it from wherever
                "ability", "able", "aboard", "about", "above", "accept", "accident", "according",
                "account", "accurate", "acres", "across", "act", "action", "active", "activity",
                "actual", "actually", "add", "addition", "additional", "adjective", "adult", "adventure",
                "advice", "affect", "afraid", "after", "afternoon", "again", "against", "age",
                "ago", "agree", "ahead", "aid", "air", "airplane", "alike", "alive",
                "all", "allow", "almost", "alone", "along", "aloud", "alphabet", "already",
                "also", "although", "am", "among", "amount", "ancient", "angle", "angry",
                "animal", "announced", "another", "answer", "ants", "any", "anybody", "anyone",
                "anything", "anyway", "anywhere", "apart", "apartment", "appearance", "apple", "applied",
                "appropriate", "are", "area", "arm", "army", "around", "arrange", "arrangement",
                "arrive", "arrow", "art", "article", "as", "aside", "ask", "asleep",
                "at", "ate", "atmosphere", "atom", "atomic", "attached", "attack", "attempt",
                "attention", "audience", "author", "automobile", "available", "average", "avoid", "aware",
                "away", "baby", "back", "bad", "badly", "bag", "balance", "ball",
                "balloon", "band", "bank", "bar", "bare", "bark", "barn", "base",
                "baseball", "basic", "basis", "basket", "bat", "battle", "be", "bean",
                "bear", "beat", "beautiful", "beauty", "became", "because", "become", "becoming",
                "bee", "been", "before", "began", "beginning", "begun", "behavior", "behind",
                "being", "believed", "bell", "belong", "below", "belt", "bend", "beneath",
                "bent", "beside", "best", "bet", "better", "between", "beyond", "bicycle",
                "bigger", "biggest", "bill", "birds", "birth", "birthday", "bit", "bite",
                "black", "blank", "blanket", "blew", "blind", "block", "blood", "blow",
                "blue", "board", "boat", "body", "bone", "book", "border", "born",
                "both", "bottle", "bottom", "bound", "bow", "bowl", "box", "boy",
                "brain", "branch", "brass", "brave", "bread", "break", "breakfast", "breath",
                "breathe", "breathing", "breeze", "brick", "bridge", "brief", "bright", "bring",
                "broad", "broke", "broken", "brother", "brought", "brown", "brush", "buffalo",
                "build", "building", "built", "buried", "burn", "burst", "bus", "bush",
                "business", "busy", "but", "butter", "buy", "by", "cabin", "cage",
                "cake", "call", "calm", "came", "camera", "camp", "can", "canal",
                "cannot", "cap", "capital", "captain", "captured", "car", "carbon", "card",
                "care", "careful", "carefully", "carried", "carry", "case", "cast", "castle",
                "cat", "catch", "cattle", "caught", "cause", "cave", "cell", "cent",
                "center", "central", "century", "certain", "certainly", "chain", "chair", "chamber",
                "chance", "change", "changing", "chapter", "character", "characteristic", "charge", "chart",
                "check", "cheese", "chemical", "chest", "chicken", "chief", "child", "children",
                "choice", "choose", "chose", "chosen", "church", "circle", "circus", "citizen",
                "city", "class", "classroom", "claws", "clay", "clean", "clear", "clearly",
                "climate", "climb", "clock", "close", "closely", "closer", "cloth", "clothes",
                "clothing", "cloud", "club", "coach", "coal", "coast", "coat", "coffee",
                "cold", "collect", "college", "colony", "color", "column", "combination", "combine",
                "come", "comfortable", "coming", "command", "common", "community", "company", "compare",
                "compass", "complete", "completely", "complex", "composed", "composition", "compound", "concerned",
                "condition", "congress", "connected", "consider", "consist", "consonant", "constantly", "construction",
                "contain", "continent", "continued", "contrast", "control", "conversation", "cook", "cookies",
                "cool", "copper", "copy", "corn", "corner", "correct", "correctly", "cost",
                "cotton", "could", "count", "country", "couple", "courage", "course", "court",
                "cover", "cow", "cowboy", "crack", "cream", "create", "creature", "crew",
                "crop", "cross", "crowd", "cry", "cup", "curious", "current", "curve",
                "customs", "cut", "cutting", "daily", "damage", "dance", "danger", "dangerous",
                "dark", "darkness", "date", "daughter", "dawn", "day", "dead", "deal",
                "dear", "death", "decide", "declared", "deep", "deeply", "deer", "definition",
                "degree", "depend", "depth", "describe", "desert", "design", "desk", "detail",
                "determine", "develop", "development", "diagram", "diameter", "did", "die", "differ",
                "difference", "different", "difficult", "difficulty", "dig", "dinner", "direct", "direction",
                "directly", "dirt", "dirty", "disappear", "discover", "discovery", "discuss", "discussion",
                "disease", "dish", "distance", "distant", "divide", "division", "do", "doctor",
                "does", "dog", "doing", "doll", "dollar", "done", "donkey", "door",
                "dot", "double", "doubt", "down", "dozen", "draw", "drawn", "dream",
                "dress", "drew", "dried", "drink", "drive", "driven", "driver", "driving",
                "drop", "dropped", "drove", "dry", "duck", "due", "dug", "dull",
                "during", "dust", "duty", "each", "eager", "ear", "earlier", "early",
                "earn", "earth", "easier", "easily", "east", "easy", "eat", "eaten",
                "edge", "education", "effect", "effort", "egg", "eight", "either", "electric",
                "electricity", "element", "elephant", "eleven", "else", "empty", "end", "enemy",
                "energy", "engine", "engineer", "enjoy", "enough", "enter", "entire", "entirely",
                "environment", "equal", "equally", "equator", "equipment", "escape", "especially", "essential",
                "establish", "even", "evening", "event", "eventually", "ever", "every", "everybody",
                "everyone", "everything", "everywhere", "evidence", "exact", "exactly", "examine", "example",
                "excellent", "except", "exchange", "excited", "excitement", "exciting", "exclaimed", "exercise",
                "exist", "expect", "experience", "experiment", "explain", "explanation", "explore", "express",
                "expression", "extra", "eye", "face", "facing", "fact", "factor", "factory",
                "failed", "fair", "fairly", "fall", "fallen", "familiar", "family", "famous",
                "far", "farm", "farmer", "farther", "fast", "fastened", "faster", "fat",
                "father", "favorite", "fear", "feathers", "feature", "fed", "feed", "feel",
                "feet", "fell", "fellow", "felt", "fence", "few", "fewer", "field",
                "fierce", "fifteen", "fifth", "fifty", "fight", "fighting", "figure", "fill",
                "film", "final", "finally", "find", "fine", "finest", "finger", "finish",
                "fire", "fireplace", "firm", "first", "fish", "five", "fix", "flag",
                "flame", "flat", "flew", "flies", "flight", "floating", "floor", "flow",
                "flower", "fly", "fog", "folks", "follow", "food", "foot", "football",
                "for", "force", "foreign", "forest", "forget", "forgot", "forgotten", "form",
                "former", "fort", "forth", "forty", "forward", "fought", "found", "four",
                "fourth", "fox", "frame", "free", "freedom", "frequently", "fresh", "friend",
                "friendly", "frighten", "frog", "from", "front", "frozen", "fruit", "fuel",
                "full", "fully", "fun", "function", "funny", "fur", "furniture", "further",
                "future", "gain", "game", "garage", "garden", "gas", "gasoline", "gate",
                "gather", "gave", "general", "generally", "gentle", "gently", "get", "getting",
                "giant", "gift", "girl", "give", "given", "giving", "glad", "glass",
                "globe", "go", "goes", "gold", "golden", "gone", "good", "goose",
                "got", "government", "grabbed", "grade", "gradually", "grain", "grandfather", "grandmother",
                "graph", "grass", "gravity", "gray", "great", "greater", "greatest", "greatly",
                "green", "grew", "ground", "group", "grow", "grown", "growth", "guard",
                "guess", "guide", "gulf", "gun", "habit", "had", "hair", "half",
                "halfway", "hall", "hand", "handle", "handsome", "hang", "happen", "happened",
                "happily", "happy", "harbor", "hard", "harder", "hardly", "has", "hat",
                "have", "having", "hay", "he", "headed", "heading", "health", "heard",
                "hearing", "heart", "heat", "heavy", "height", "held", "hello", "help",
                "helpful", "her", "herd", "here", "herself", "hidden", "hide", "high",
                "higher", "highest", "highway", "hill", "him", "himself", "his", "history",
                "hit", "hold", "hole", "hollow", "home", "honor", "hope", "horn",
                "horse", "hospital", "hot", "hour", "house", "how", "however", "huge",
                "human", "hundred", "hung", "hungry", "hunt", "hunter", "hurried", "hurry",
                "hurt", "husband", "ice", "idea", "identity", "if", "ill", "image",
                "imagine", "immediately", "importance", "important", "impossible", "improve", "in", "inch",
                "include", "including", "income", "increase", "indeed", "independent", "indicate", "individual",
                "industrial", "industry", "influence", "information", "inside", "instance", "instant", "instead",
                "instrument", "interest", "interior", "into", "introduced", "invented", "involved", "iron",
                "is", "island", "it", "its", "itself", "jack", "jar", "jet",
                "job", "join", "joined", "journey", "joy", "judge", "jump", "jungle",
                "just", "keep", "kept", "key", "kids", "kill", "kind", "kitchen",
                "knew", "knife", "know", "knowledge", "known", "label", "labor", "lack",
                "lady", "laid", "lake", "lamp", "land", "language", "large", "larger",
                "largest", "last", "late", "later", "laugh", "law", "lay", "layers",
                "lead", "leader", "leaf", "learn", "least", "leather", "leave", "leaving",
                "led", "left", "leg", "length", "lesson", "let", "letter", "level",
                "library", "lie", "life", "lift", "light", "like", "likely", "limited",
                "line", "lion", "lips", "liquid", "list", "listen", "little", "live",
                "living", "load", "local", "locate", "location", "log", "lonely", "long",
                "longer", "look", "loose", "lose", "loss", "lost", "lot", "loud",
                "love", "lovely", "low", "lower", "luck", "lucky", "lunch", "lungs",
                "lying", "machine", "machinery", "mad", "made", "magic", "magnet", "mail",
                "main", "mainly", "major", "make", "making", "man", "managed", "manner",
                "manufacturing", "many", "map", "mark", "market", "married", "mass", "massage",
                "master", "material", "mathematics", "matter", "may", "maybe", "me", "meal",
                "mean", "means", "meant", "measure", "meat", "medicine", "meet", "melted",
                "member", "memory", "men", "mental", "merely", "met", "metal", "method",
                "mice", "middle", "might", "mighty", "mile", "military", "milk", "mill",
                "mind", "mine", "minerals", "minute", "mirror", "missing", "mission", "mistake",
                "mix", "mixture", "model", "modern", "molecular", "moment", "money", "monkey",
                "month", "mood", "moon", "more", "morning", "most", "mostly", "mother",
                "motion", "motor", "mountain", "mouse", "mouth", "move", "movement", "movie",
                "moving", "mud", "muscle", "music", "musical", "must", "my", "myself",
                "mysterious", "nails", "name", "nation", "national", "native", "natural", "naturally",
                "nature", "near", "nearby", "nearer", "nearest", "nearly", "necessary", "neck",
                "needed", "needle", "needs", "negative", "neighbor", "neighborhood", "nervous", "nest",
                "never", "new", "news", "newspaper", "next", "nice", "night", "nine",
                "no", "nobody", "nodded", "noise", "none", "noon", "nor", "north",
                "nose", "not", "note", "noted", "nothing", "notice", "noun", "now",
                "number", "numeral", "nuts", "object", "observe", "obtain", "occasionally", "occur",
                "ocean", "of", "off", "offer", "office", "officer", "official", "oil",
                "old", "older", "oldest", "on", "once", "one", "only", "onto",
                "open", "operation", "opinion", "opportunity", "opposite", "or", "orange", "orbit",
                "order", "ordinary", "organization", "organized", "origin", "original", "other", "ought",
                "our", "ourselves", "out", "outer", "outline", "outside", "over", "own",
                "owner", "oxygen", "pack", "package", "page", "paid", "pain", "paint",
                "pair", "palace", "pale", "pan", "paper", "paragraph", "parallel", "parent",
                "park", "part", "particles", "particular", "particularly", "partly", "parts", "party",
                "pass", "passage", "past", "path", "pattern", "pay", "peace", "pen",
                "pencil", "people", "per", "percent", "perfect", "perfectly", "perhaps", "period",
                "person", "personal", "pet", "phrase", "physical", "piano", "pick", "picture",
                "pictured", "pie", "piece", "pig", "pile", "pilot", "pine", "pink",
                "pipe", "pitch", "place", "plain", "plan", "plane", "planet", "planned",
                "planning", "plant", "plastic", "plate", "plates", "play", "pleasant", "please",
                "pleasure", "plenty", "plural", "plus", "pocket", "poem", "poet", "poetry",
                "point", "pole", "police", "policeman", "political", "pond", "pony", "pool",
                "poor", "popular", "population", "porch", "port", "position", "positive", "possible",
                "possibly", "post", "pot", "potatoes", "pound", "pour", "powder", "power",
                "powerful", "practical", "practice", "prepare", "present", "president", "press", "pressure",
                "pretty", "prevent", "previous", "price", "pride", "primitive", "principal", "principle",
                "printed", "private", "prize", "probably", "problem", "process", "produce", "product",
                "production", "program", "progress", "promised", "proper", "properly", "property", "protection",
                "proud", "prove", "provide", "public", "pull", "pupil", "pure", "purple",
                "purpose", "push", "put", "putting", "quarter", "queen", "question", "quick",
                "quickly", "quiet", "quietly", "quite", "rabbit", "race", "radio", "railroad",
                "rain", "raise", "ran", "ranch", "range", "rapidly", "rate", "rather",
                "raw", "rays", "reach", "read", "reader", "ready", "real", "realize",
                "rear", "reason", "recall", "receive", "recent", "recently", "recognize", "record",
                "red", "refer", "refused", "region", "regular", "related", "relationship", "religious",
                "remain", "remarkable", "remember", "remove", "repeat", "replace", "replied", "report",
                "represent", "require", "research", "respect", "rest", "result", "return", "review",
                "rhyme", "rhythm", "rice", "rich", "ride", "riding", "right", "ring",
                "rise", "rising", "river", "road", "roar", "rock", "rocket", "rocky",
                "rod", "roll", "roof", "room", "root", "rope", "rose", "rough",
                "round", "route", "row", "rubbed", "rubber", "rule", "ruler", "run",
                "running", "rush", "sad", "saddle", "safe", "safety", "said", "sail",
                "sale", "salmon", "salt", "same", "sand", "sang", "sat", "satellites",
                "satisfied", "save", "saved", "saw", "say", "scale", "scared", "scene",
                "school", "science", "scientific", "scientist", "score", "screen", "sea", "search",
                "season", "seat", "second", "secret", "section", "see", "seed", "seeing",
                "seems", "seen", "seldom", "select", "selection", "sell", "send", "sense",
                "sent", "sentence", "separate", "series", "serious", "serve", "service", "sets",
                "setting", "settle", "settlers", "seven", "several", "shade", "shadow", "shake",
                "shaking", "shall", "shallow", "shape", "share", "sharp", "she", "sheep",
                "sheet", "shelf", "shells", "shelter", "shine", "shinning", "ship", "shirt",
                "shoe", "shoot", "shop", "shore", "short", "shorter", "shot", "should",
                "shoulder", "shout", "show", "shown", "shut", "sick", "sides", "sight",
                "sign", "signal", "silence", "silent", "silk", "silly", "silver", "similar",
                "simple", "simplest", "simply", "since", "sing", "single", "sink", "sister",
                "sit", "sitting", "situation", "six", "size", "skill", "skin", "sky",
                "slabs", "slave", "sleep", "slept", "slide", "slight", "slightly", "slip",
                "slipped", "slope", "slow", "slowly", "small", "smaller", "smallest", "smell",
                "smile", "smoke", "smooth", "snake", "snow", "so", "soap", "social",
                "society", "soft", "softly", "soil", "solar", "sold", "soldier", "solid",
                "solution", "solve", "some", "somebody", "somehow", "someone", "something", "sometime",
                "somewhere", "son", "song", "soon", "sort", "sound", "source", "south",
                "southern", "space", "speak", "special", "species", "specific", "speech", "speed",
                "spell", "spend", "spent", "spider", "spin", "spirit", "spite", "split",
                "spoken", "sport", "spread", "spring", "square", "stage", "stairs", "stand",
                "standard", "star", "stared", "start", "state", "statement", "station", "stay",
                "steady", "steam", "steel", "steep", "stems", "step", "stepped", "stick",
                "stiff", "still", "stock", "stomach", "stone", "stood", "stop", "stopped",
                "store", "storm", "story", "stove", "straight", "strange", "stranger", "straw",
                "stream", "street", "strength", "stretch", "strike", "string", "strip", "strong",
                "stronger", "struck", "structure", "struggle", "stuck", "student", "studied", "studying",
                "subject", "substance", "success", "successful", "such", "sudden", "suddenly", "sugar",
                "suggest", "suit", "sum", "summer", "sun", "sunlight", "supper", "supply",
                "support", "suppose", "sure", "surface", "surprise", "surrounded", "swam", "sweet",
                "swept", "swim", "swimming", "swing", "swung", "syllable", "symbol", "system",
                "table", "tail", "take", "taken", "tales", "talk", "tall", "tank",
                "tape", "task", "taste", "taught", "tax", "tea", "teach", "teacher",
                "team", "tears", "teeth", "telephone", "television", "tell", "temperature", "ten",
                "tent", "term", "terrible", "test", "than", "thank", "that", "thee",
                "them", "themselves", "then", "theory", "there", "therefore", "these", "they",
                "thick", "thin", "thing", "think", "third", "thirty", "this", "those",
                "thou", "though", "thought", "thousand", "thread", "three", "threw", "throat",
                "through", "throughout", "throw", "thrown", "thumb", "thus", "thy", "tide",
                "tie", "tight", "tightly", "till", "time", "tin", "tiny", "tip",
                "tired", "title", "to", "tobacco", "today", "together", "told", "tomorrow",
                "tone", "tongue", "tonight", "too", "took", "tool", "top", "topic",
                "torn", "total", "touch", "toward", "tower", "town", "toy", "trace",
                "track", "trade", "traffic", "trail", "train", "transportation", "trap", "travel",
                "treated", "tree", "triangle", "tribe", "trick", "tried", "trip", "troops",
                "tropical", "trouble", "truck", "trunk", "truth", "try", "tube", "tune",
                "turn", "twelve", "twenty", "twice", "two", "type", "typical", "uncle",
                "under", "underline", "understanding", "unhappy", "union", "unit", "universe", "unknown",
                "unless", "until", "unusual", "up", "upon", "upper", "upward", "us",
                "use", "useful", "using", "usual", "usually", "valley", "valuable", "value",
                "vapor", "variety", "various", "vast", "vegetable", "verb", "vertical", "very",
                "vessels", "victory", "view", "village", "visit", "visitor", "voice", "volume",
                "vote", "vowel", "voyage", "wagon", "wait", "walk", "wall", "want",
                "war", "warm", "warn", "was", "wash", "waste", "watch", "water",
                "wave", "way", "we", "weak", "wealth", "wear", "weather", "week",
                "weigh", "weight", "welcome", "well", "went", "were", "west", "western",
                "wet", "whale", "what", "whatever", "wheat", "wheel", "when", "whenever",
                "where", "wherever", "whether", "which", "while", "whispered", "whistle", "white",
                "who", "whole", "whom", "whose", "why", "wide", "widely", "wife",
                "wild", "will", "willing", "win", "wind", "window", "wing", "winter",
                "wire", "wise", "wish", "with", "within", "without", "wolf", "women",
                "won", "wonder", "wonderful", "wood", "wooden", "wool", "word", "wore",
                "work", "worker", "world", "worried", "worry", "worse", "worth", "would",
                "wrapped", "write", "writer", "writing", "written", "wrong", "wrote", "yard",
                "year", "yellow", "yes", "yesterday", "yet", "you", "young", "younger",
                "your", "yourself", "youth", "zero", "zebra", "zipper", "zoo", "zulu"
            ];
            function words(options) {

                function word() {
                    if (options && options.maxLength > 1) {
                        return generateWordWithMaxLength();
                    } else {
                        return generateRandomWord();
                    }
                }

                function generateWordWithMaxLength() {
                    var rightSize = false;
                    var wordUsed;
                    while (!rightSize) {
                        wordUsed = generateRandomWord();
                        if (wordUsed.length <= options.maxLength) {
                            rightSize = true;
                        }

                    }
                    return wordUsed;
                }

                function generateRandomWord() {
                    return wordList[randInt(wordList.length)];
                }

                function randInt(lessThan) {
                    return Math.floor(Math.random() * lessThan);
                }

                // No arguments = generate one word
                if (typeof (options) === 'undefined') {
                    return word();
                }

                // Just a number = return that many words
                if (typeof (options) === 'number') {
                    options = { exactly: options };
                }

                // options supported: exactly, min, max, join
                if (options.exactly) {
                    options.min = options.exactly;
                    options.max = options.exactly;
                }

                // not a number = one word par string
                if (typeof (options.wordsPerString) !== 'number') {
                    options.wordsPerString = 1;
                }

                //not a function = returns the raw word
                if (typeof (options.formatter) !== 'function') {
                    options.formatter = (word) => word;
                }

                //not a string = separator is a space
                if (typeof (options.separator) !== 'string') {
                    options.separator = ' ';
                }

                var total = options.min + randInt(options.max + 1 - options.min);
                var results = [];
                var token = '';
                var relativeIndex = 0;

                for (var i = 0; (i < total * options.wordsPerString); i++) {
                    if (relativeIndex === options.wordsPerString - 1) {
                        token += options.formatter(word(), relativeIndex);
                    }
                    else {
                        token += options.formatter(word(), relativeIndex) + options.separator;
                    }
                    relativeIndex++;
                    if ((i + 1) % options.wordsPerString === 0) {
                        results.push(token);
                        token = '';
                        relativeIndex = 0;
                    }

                }
                if (typeof options.join === 'string') {
                    results = results.join(options.join);
                }

                return results;
            }
            return words(opts);
        })(opts);
    }
}

class jsPsych {
    static ParameterType = (function () {
        let ParameterType = {}
        ParameterType[ParameterType["BOOL"] = 0] = "BOOL";
        ParameterType[ParameterType["STRING"] = 1] = "STRING";
        ParameterType[ParameterType["INT"] = 2] = "INT";
        ParameterType[ParameterType["FLOAT"] = 3] = "FLOAT";
        ParameterType[ParameterType["FUNCTION"] = 4] = "FUNCTION";
        ParameterType[ParameterType["KEY"] = 5] = "KEY";
        ParameterType[ParameterType["KEYS"] = 6] = "KEYS";
        ParameterType[ParameterType["SELECT"] = 7] = "SELECT";
        ParameterType[ParameterType["HTML_STRING"] = 8] = "HTML_STRING";
        ParameterType[ParameterType["IMAGE"] = 9] = "IMAGE";
        ParameterType[ParameterType["AUDIO"] = 10] = "AUDIO";
        ParameterType[ParameterType["VIDEO"] = 11] = "VIDEO";
        ParameterType[ParameterType["OBJECT"] = 12] = "OBJECT";
        ParameterType[ParameterType["COMPLEX"] = 13] = "COMPLEX";
        ParameterType[ParameterType["TIMELINE"] = 14] = "TIMELINE";
        return ParameterType;
    })();
    constructor(options) {
        this.extensions = {};
        this.plugins = {};
        this.opts = {};
        // flow control
        this.global_trial_index = 0;
        this.current_trial = {};
        this.current_trial_finished = false;
        /**
         * is the experiment paused?
         */
        this.paused = false;
        this.waiting = false;
        /**
         * Is the experiment interrupted and resumed
         */
        this.is_interrupt = false;
        /**
         * is the page retrieved directly via file:// protocol (true) or hosted on a server (false)?
         */
        this.file_protocol = false;
        /**
         * is the experiment running in `simulate()` mode
         */
        this.simulation_mode = null;
        // storing a single webaudio context to prevent problems with multiple inits
        // of jsPsych
        this.webaudio_context = null;
        this.internal = {
            /**
             * this flag is used to determine whether we are in a scope where
             * jsPsych.timelineVariable() should be executed immediately or
             * whether it should return a function to access the variable later.
             *
             **/
            call_immediate: false,
        };
        this.progress_bar_amount = 0;
        // override default options if user specifies an option
        options = Object.assign({
            display_element: undefined,
            on_finish: () => { },
            on_trial_start: () => { },
            on_trial_finish: () => { },
            on_data_update: () => { },
            on_interaction_data_update: () => { },
            on_close: () => { },
            use_webaudio: true,
            exclusions: {},
            show_progress_bar: false,
            message_progress_bar: "Completion Progress",
            auto_update_progress_bar: true,
            default_iti: 0,
            minimum_valid_rt: 0,
            experiment_width: null,
            override_safe_mode: false,
            case_sensitive_responses: false,
            extensions: [],
            loadPath: "",
            autoLoadAssets: true,
            allowRestart: false
        }, options);

        this.opts = options;
        Utils.autoBind(this);
        this.webaudio_context =
            typeof window !== "undefined" && typeof window.AudioContext !== "undefined"
                ? new AudioContext()
                : null;
        // detect whether page is running in browser as a local file, and if so, disable web audio and video preloading to prevent CORS issues
        if (window.location.protocol == "file:" &&
            (options.override_safe_mode === false || typeof options.override_safe_mode === "undefined")) {
            options.use_webaudio = false;
            this.file_protocol = true;
            console.warn("jsPsych detected that it is running via the file:// protocol and not on a web server. " +
                "To prevent issues with cross-origin requests, Web Audio and video preloading have been disabled. " +
                "If you would like to override this setting, you can set 'override_safe_mode' to 'true' in initJsPsych. " +
                "For more information, see: https://www.jspsych.org/overview/running-experiments");
        }
        // initialize modules
        this.data = new Data(this);
        this.pluginAPI = ((jsPsych) => {
            const settings = jsPsych.getInitSettings();
            return Object.assign({}, ...[
                new KeyboardListenerAPI(jsPsych.getDisplayContainerElement, settings.case_sensitive_responses, settings.minimum_valid_rt),
                new TimeoutAPI(),
                new MediaAPI(settings.use_webaudio, jsPsych.webaudio_context),
                new SimulationAPI(),
                new HardwareAPI()
            ].map((object) => Utils.autoBind(object)));
        })(this);
        this.randomization = class extends Random { };
        this.utils = class extends Utils { };
    }
    universalPluginParameters() {
        return {
            data: {
                type: jsPsych.ParameterType.OBJECT,
                pretty_name: "Data",
                default: {},
            },
            on_start: {
                type: jsPsych.ParameterType.FUNCTION,
                pretty_name: "On start",
                default: function () {
                    return;
                },
            },
            on_finish: {
                type: jsPsych.ParameterType.FUNCTION,
                pretty_name: "On finish",
                default: function () {
                    return;
                },
            },
            on_load: {
                type: jsPsych.ParameterType.FUNCTION,
                pretty_name: "On load",
                default: function () {
                    return;
                },
            },
            post_trial_gap: {
                type: jsPsych.ParameterType.INT,
                pretty_name: "Post trial gap",
                default: null,
            },
            css_classes: {
                type: jsPsych.ParameterType.STRING,
                pretty_name: "Custom CSS classes",
                default: null,
            },
            simulation_options: {
                type: jsPsych.ParameterType.COMPLEX,
                default: null,
            },
        }
    }
    version() {
        return "v6.5.2";
    }
    run(timeline) {
        return Utils.__awaiter(this, void 0, void 0, function* () {

            if (typeof timeline === "undefined") {
                console.error("No timeline declared in jsPsych.run. Cannot start experiment.");
            }
            if (timeline.length === 0) {
                console.error("No trials have been added to the timeline (the timeline is an empty array). Cannot start experiment.");
            }
            if(this.opts.autoLoadAssets) {
                this.loadExtensionsSrc(this.opts.extensions);
            }
            for (const extension of this.opts.extensions) {
                this.extensions[extension.type] = new jspsychExtensions[extension.type](this);
            }
            if(this.opts.autoLoadAssets) { 
                this.loadPluginsSrc(timeline);
            }
            // create experiment timeline
            this.timelineDescription = timeline;
            this.timeline = new TimelineNode(this, { timeline });
            yield this.prepareDom();
            yield this.checkExclusions(this.opts.exclusions);
            yield this.loadExtensions(this.opts.extensions);
            document.documentElement.setAttribute("jspsych", "present");
            if(this.opts.allowRestart) {
                this.isInterrupt();
            }
            this.startExperiment();
            yield this.finished;
        });
    }
    getPlugins(timeline, plugins = []) {
        if (typeof (timeline) === "undefined") {
            return plugins;
        }
        if (!Array.isArray(timeline)) {
            timeline = [timeline];
        }
        timeline.forEach(f => {
            if (typeof (f) === "undefined") { return plugins; }
            if (f.timeline) {
                plugins = this.getPlugins(f.timeline, plugins);
            }
            if (f.type && plugins.indexOf(f.type) < 0) {
                plugins.push(f.type);
            }
        });
        return plugins;
    }
    loadPluginsSrc(timeline) {
        for (let i of this.getPlugins(timeline)) {
            if(typeof(jspsychPlugins) != "object") { var jspsychPlugins = {} }
            if (typeof (jspsychPlugins[i]) == "undefined") {
                Utils.addJs(document.head, `${this.opts.loadPath}/plugins/plugin-${i}.js`)
            }
        }
        this.plugins = Utils.deepCopy(jspsychPlugins);
    }
    loadExtensionsSrc(extensions) {
        extensions.forEach(v => {
            if (typeof (this.extensions[v]) == "undefined") {
                Utils.addJs(document.head, `${this.opts.loadPath}/extensions/extension-${v.type}.js`)
            }
        })
    }
    simulate(timeline, simulation_mode = "data-only", simulation_options = {}) {
        return Utils.__awaiter(this, void 0, void 0, function* () {
            this.simulation_mode = simulation_mode;
            this.simulation_options = simulation_options;
            yield this.run(timeline);
        });
    }
    getProgress() {
        return {
            total_trials: typeof this.timeline === "undefined" ? undefined : this.timeline.length(),
            current_trial_global: this.global_trial_index,
            percent_complete: typeof this.timeline === "undefined" ? 0 : this.timeline.percentComplete(),
        };
    }
    getStartTime() {
        return this.exp_start_time;
    }
    getTotalTime() {
        if (typeof this.exp_start_time === "undefined") {
            return 0;
        }
        return new Date().getTime() - this.exp_start_time.getTime();
    }
    getDisplayElement() {
        return this.DOM_target;
    }
    getDisplayContainerElement() {
        return this.DOM_container;
    }
    finishTrial(data = {}) {
        if (this.current_trial_finished) {
            return;
        }
        this.current_trial_finished = true;
        // remove any CSS classes that were added to the DOM via css_classes parameter
        if (typeof this.current_trial.css_classes !== "undefined" &&
            Array.isArray(this.current_trial.css_classes)) {
            this.DOM_target.classList.remove(...this.current_trial.css_classes);
        }
        // write the data from the trial
        this.data.write(data);
        // get back the data with all of the defaults in
        const trial_data = this.data.get().filter({ trial_index: this.global_trial_index });
        // for trial-level callbacks, we just want to pass in a reference to the values
        // of the DataCollection, for easy access and editing.
        const trial_data_values = trial_data.values()[0];
        const current_trial = this.current_trial;
        if (typeof current_trial.save_trial_parameters === "object") {
            for (const key of Object.keys(current_trial.save_trial_parameters)) {
                const key_val = current_trial.save_trial_parameters[key];
                if (key_val === true) {
                    if (typeof current_trial[key] === "undefined") {
                        console.warn(`Invalid parameter specified in save_trial_parameters. Trial has no property called "${key}".`);
                    }
                    else if (typeof current_trial[key] === "function") {
                        trial_data_values[key] = current_trial[key].toString();
                    }
                    else {
                        trial_data_values[key] = current_trial[key];
                    }
                }
                if (key_val === false) {
                    // we don't allow internal_node_id or trial_index to be deleted because it would break other things
                    if (key !== "internal_node_id" && key !== "trial_index") {
                        delete trial_data_values[key];
                    }
                }
            }
        }
        // handle extension callbacks
        if (Array.isArray(current_trial.extensions)) {
            for (const extension of current_trial.extensions) {
                const ext_data_values = this.extensions[extension.type].on_finish(extension.params);
                Object.assign(trial_data_values, ext_data_values);
            }
        }
        // about to execute lots of callbacks, so switch context.
        this.internal.call_immediate = true;
        // handle callback at plugin level
        if (typeof current_trial.on_finish === "function") {
            current_trial.on_finish(trial_data_values);
        }
        // handle callback at whole-experiment level
        this.opts.on_trial_finish(trial_data_values);
        // after the above callbacks are complete, then the data should be finalized
        // for this trial. call the on_data_update handler, passing in the same
        // data object that just went through the trial's finish handlers.
        this.opts.on_data_update(trial_data_values);
        // done with callbacks
        this.internal.call_immediate = false;
        // wait for iti
        if (typeof current_trial.post_trial_gap === null ||
            typeof current_trial.post_trial_gap === "undefined") {
            if (this.opts.default_iti > 0) {
                setTimeout(this.nextTrial, this.opts.default_iti);
            }
            else {
                this.nextTrial();
            }
        }
        else {
            if (current_trial.post_trial_gap > 0) {
                setTimeout(this.nextTrial, current_trial.post_trial_gap);
            }
            else {
                this.nextTrial();
            }
        }
    }
    endExperiment(end_message = "", data = {}) {
        this.timeline.end_message = end_message;
        this.timeline.end();
        this.pluginAPI.cancelAllKeyboardResponses();
        this.pluginAPI.clearAllTimeouts();
        this.finishTrial(data);
    }
    endCurrentTimeline() {
        this.timeline.endActiveNode();
    }
    getCurrentTrial() {
        return this.current_trial;
    }
    getInitSettings() {
        return this.opts;
    }
    getCurrentTimelineNodeID() {
        return this.timeline.activeID();
    }
    timelineVariable(varname, immediate = false) {
        if (this.internal.call_immediate || immediate === true) {
            return this.timeline.timelineVariable(varname);
        }
        else {
            return {
                timelineVariablePlaceholder: true,
                timelineVariableFunction: () => this.timeline.timelineVariable(varname),
            };
        }
    }
    getAllTimelineVariables() {
        return this.timeline.allTimelineVariables();
    }
    addNodeToEndOfTimeline(new_timeline) {
        this.timeline.insert(new_timeline);
    }
    pauseExperiment() {
        this.paused = true;
    }
    resumeExperiment() {
        this.paused = false;
        if (this.waiting) {
            this.waiting = false;
            this.nextTrial();
        }
    }
    loadFail(message) {
        message = message || "<p>The experiment failed to load.</p>";
        this.DOM_target.innerHTML = message;
    }
    getSafeModeStatus() {
        return this.file_protocol;
    }
    getTimeline() {
        return this.timelineDescription;
    }
    prepareDom() {
        return Utils.__awaiter(this, void 0, void 0, function* () {
            // Wait until the document is ready
            if (document.readyState !== "complete") {
                yield new Promise((resolve) => {
                    window.addEventListener("load", resolve);
                });
            }
            const options = this.opts;
            // set DOM element where jsPsych will render content
            // if undefined, then jsPsych will use the <body> tag and the entire page
            if (typeof options.display_element === "undefined") {
                // check if there is a body element on the page
                const body = document.querySelector("body");
                if (body === null) {
                    document.documentElement.appendChild(document.createElement("body"));
                }
                // using the full page, so we need the HTML element to
                // have 100% height, and body to be full width and height with
                // no margin
                document.querySelector("html").style.height = "100%";
                document.querySelector("body").style.margin = "0px";
                document.querySelector("body").style.height = "100%";
                document.querySelector("body").style.width = "100%";
                options.display_element = document.querySelector("body");
            }
            else {
                // make sure that the display element exists on the page
                const display = options.display_element instanceof Element
                    ? options.display_element
                    : document.querySelector("#" + options.display_element);
                if (display === null) {
                    console.error("The display_element specified in initJsPsych() does not exist in the DOM.");
                }
                else {
                    options.display_element = display;
                }
            }
            options.display_element.innerHTML =
                '<div class="jspsych-content-wrapper"><div id="jspsych-content"></div></div>';
            this.DOM_container = options.display_element;
            this.DOM_target = document.querySelector("#jspsych-content");
            // set experiment_width if not null
            if (options.experiment_width !== null) {
                this.DOM_target.style.width = options.experiment_width + "px";
            }
            // add tabIndex attribute to scope event listeners
            options.display_element.tabIndex = 0;
            // add CSS class to DOM_target
            if (options.display_element.className.indexOf("jspsych-display-element") === -1) {
                options.display_element.className += " jspsych-display-element";
            }
            this.DOM_target.className += "jspsych-content";
            // create listeners for user browser interaction
            this.data.createInteractionListeners();
            // add event for closing window
            window.addEventListener("beforeunload", options.on_close);
        });
    }
    loadExtensions(extensions) {
        return Utils.__awaiter(this, void 0, void 0, function* () {

            // run the .initialize method of any extensions that are in use
            // these should return a Promise to indicate when loading is complete
            try {
                yield Promise.all(extensions.map((extension) => this.extensions[extension.type].initialize(extension.params || {})));
            }
            catch (error_message) {
                console.error(error_message);
                throw new Error(error_message);
            }
        });
    }
    startExperiment() {
        this.finished = new Promise((resolve) => {
            this.resolveFinishedPromise = resolve;
        });
        // show progress bar if requested
        if (this.opts.show_progress_bar === true) {
            this.drawProgressBar(this.opts.message_progress_bar);
        }
        // record the start time
        this.exp_start_time = new Date();
        // begin!
        this.timeline.advance();
        this.doTrial(this.timeline.trial());
    }
    finishExperiment() {
        const finish_result = this.opts.on_finish(this.data.get());
        const done_handler = () => {
            if (typeof this.timeline.end_message !== "undefined") {
                this.DOM_target.innerHTML = this.timeline.end_message;
            }
            this.resolveFinishedPromise();
        };
        if (finish_result) {
            Promise.resolve(finish_result).then(done_handler);
        }
        else {
            done_handler();
        }
    }
    nextTrial() {
        // if experiment is paused, don't do anything.
        if (this.paused) {
            this.waiting = true;
            return;
        }
        this.global_trial_index++;
        // advance timeline
        this.timeline.markCurrentTrialComplete();
        const complete = this.timeline.advance();
        // update progress bar if shown
        if (this.opts.show_progress_bar === true && this.opts.auto_update_progress_bar === true) {
            this.updateProgressBar();
        }
        // check if experiment is over
        if (complete) {
            this.finishExperiment();
            return;
        }
        this.doTrial(this.timeline.trial());
    }
    doTrial(trial) {
        this.current_trial = trial;
        this.current_trial_finished = false;
        // process all timeline variables for this trial
        this.evaluateTimelineVariables(trial);
        // if (typeof trial.type === "string") {
        //     throw new MigrationError("A string was provided as the trial's `type` parameter. Since jsPsych v7, the `type` parameter needs to be a plugin object.");
        // }
        // instantiate the plugin for this trial
        trial.type = Object.assign(Object.assign({}, Utils.autoBind(new jspsychPlugins[trial.type](this))), { info: jspsychPlugins[trial.type].info });
        // evaluate variables that are functions
        this.evaluateFunctionParameters(trial);
        // get default values for parameters
        this.setDefaultValues(trial);
        // about to execute callbacks
        this.internal.call_immediate = true;
        // call experiment wide callback
        this.opts.on_trial_start(trial);
        // call trial specific callback if it exists
        if (typeof trial.on_start === "function") {
            trial.on_start(trial);
        }
        // call any on_start functions for extensions
        if (Array.isArray(trial.extensions)) {
            for (const extension of trial.extensions) {
                this.extensions[extension.type].on_start(extension.params);
            }
        }
        // apply the focus to the element containing the experiment.
        this.DOM_container.focus();
        // reset the scroll on the DOM target
        this.DOM_target.scrollTop = 0;
        // add CSS classes to the DOM_target if they exist in trial.css_classes
        if (typeof trial.css_classes !== "undefined") {
            if (!Array.isArray(trial.css_classes) && typeof trial.css_classes === "string") {
                trial.css_classes = [trial.css_classes];
            }
            if (Array.isArray(trial.css_classes)) {
                this.DOM_target.classList.add(...trial.css_classes);
            }
        }
        // setup on_load event callback
        const load_callback = () => {
            if (typeof trial.on_load === "function") {
                trial.on_load();
            }
            // call any on_load functions for extensions
            if (Array.isArray(trial.extensions)) {
                for (const extension of trial.extensions) {
                    this.extensions[extension.type].on_load(extension.params);
                }
            }
        };
        let trial_complete;
        if (!this.simulation_mode) {
            trial_complete = trial.type.trial(this.DOM_target, trial, load_callback);
        }
        if (this.simulation_mode) {
            // check if the trial supports simulation
            if (trial.type.simulate) {
                let trial_sim_opts;
                if (!trial.simulation_options) {
                    trial_sim_opts = this.simulation_options.default;
                }
                if (trial.simulation_options) {
                    if (typeof trial.simulation_options == "string") {
                        if (this.simulation_options[trial.simulation_options]) {
                            trial_sim_opts = this.simulation_options[trial.simulation_options];
                        }
                        else if (this.simulation_options.default) {
                            console.log(`No matching simulation options found for "${trial.simulation_options}". Using "default" options.`);
                            trial_sim_opts = this.simulation_options.default;
                        }
                        else {
                            console.log(`No matching simulation options found for "${trial.simulation_options}" and no "default" options provided. Using the default values provided by the plugin.`);
                            trial_sim_opts = {};
                        }
                    }
                    else {
                        trial_sim_opts = trial.simulation_options;
                    }
                }
                trial_sim_opts = this.utils.deepCopy(trial_sim_opts);
                trial_sim_opts = this.replaceFunctionsWithValues(trial_sim_opts, null);
                if ((trial_sim_opts === null || trial_sim_opts === void 0 ? void 0 : trial_sim_opts.simulate) === false) {
                    trial_complete = trial.type.trial(this.DOM_target, trial, load_callback);
                }
                else {
                    trial_complete = trial.type.simulate(trial, (trial_sim_opts === null || trial_sim_opts === void 0 ? void 0 : trial_sim_opts.mode) || this.simulation_mode, trial_sim_opts, load_callback);
                }
            }
            else {
                // trial doesn't have a simulate method, so just run as usual
                trial_complete = trial.type.trial(this.DOM_target, trial, load_callback);
            }
        }
        // see if trial_complete is a Promise by looking for .then() function
        const is_promise = trial_complete && typeof trial_complete.then == "function";
        // in simulation mode we let the simulate function call the load_callback always.
        if (!is_promise && !this.simulation_mode) {
            load_callback();
        }
        // done with callbacks
        this.internal.call_immediate = false;
    }
    evaluateTimelineVariables(trial) {
        for (const key of Object.keys(trial)) {
            // timeline variables on the root level
            if (typeof trial[key] === "object" &&
                trial[key] !== null &&
                typeof trial[key].timelineVariablePlaceholder !== "undefined") {
                /*trial[key].toString().replace(/\s/g, "") ==
                  "function(){returntimeline.timelineVariable(varname);}"
              )*/ trial[key] = trial[key].timelineVariableFunction();
            }
            // timeline variables that are nested in objects
            if (typeof trial[key] === "object" && trial[key] !== null) {
                this.evaluateTimelineVariables(trial[key]);
            }
        }
    }
    evaluateFunctionParameters(trial) {
        // set a flag so that jsPsych.timelineVariable() is immediately executed in this context
        this.internal.call_immediate = true;
        // iterate over each parameter
        for (const key of Object.keys(trial)) {
            // check to make sure parameter is not "type", since that was eval'd above.
            if (key !== "type") {
                // this if statement is checking to see if the parameter type is expected to be a function, in which case we should NOT evaluate it.
                // the first line checks if the parameter is defined in the universalPluginParameters set
                // the second line checks the plugin-specific parameters
                if (typeof this.universalPluginParameters()[key] !== "undefined" &&
                    this.universalPluginParameters()[key].type !== jsPsych.ParameterType.FUNCTION) {
                    trial[key] = this.replaceFunctionsWithValues(trial[key], null);
                }
                if (typeof trial.type.info.parameters[key] !== "undefined" &&
                    trial.type.info.parameters[key].type !== jsPsych.ParameterType.FUNCTION) {
                    trial[key] = this.replaceFunctionsWithValues(trial[key], trial.type.info.parameters[key]);
                }
            }
        }
        // reset so jsPsych.timelineVariable() is no longer immediately executed
        this.internal.call_immediate = false;
    }
    replaceFunctionsWithValues(obj, info) {
        // null typeof is 'object' (?!?!), so need to run this first!
        if (obj === null) {
            return obj;
        }
        // arrays
        else if (Array.isArray(obj)) {
            for (let i = 0; i < obj.length; i++) {
                obj[i] = this.replaceFunctionsWithValues(obj[i], info);
            }
        }
        // objects
        else if (typeof obj === "object") {
            if (info === null || !info.nested) {
                for (const key of Object.keys(obj)) {
                    if (key === "type") {
                        // Ignore the object's `type` field because it contains a plugin and we do not want to
                        // call plugin functions
                        continue;
                    }
                    obj[key] = this.replaceFunctionsWithValues(obj[key], null);
                }
            }
            else {
                for (const key of Object.keys(obj)) {
                    if (typeof info.nested[key] === "object" &&
                        info.nested[key].type !== jsPsych.ParameterType.FUNCTION) {
                        obj[key] = this.replaceFunctionsWithValues(obj[key], info.nested[key]);
                    }
                }
            }
        }
        else if (typeof obj === "function") {
            return obj();
        }
        return obj;
    }
    setDefaultValues(trial) {
        for (const param in trial.type.info.parameters) {
            // check if parameter is complex with nested defaults
            if (trial.type.info.parameters[param].type === jsPsych.ParameterType.COMPLEX) {
                if (trial.type.info.parameters[param].array === true) {
                    // iterate over each entry in the array
                    trial[param].forEach(function (ip, i) {
                        // check each parameter in the plugin description
                        for (const p in trial.type.info.parameters[param].nested) {
                            if (typeof trial[param][i][p] === "undefined" || trial[param][i][p] === null) {
                                if (typeof trial.type.info.parameters[param].nested[p].default === "undefined") {
                                    console.error("You must specify a value for the " +
                                        p +
                                        " parameter (nested in the " +
                                        param +
                                        " parameter) in the " +
                                        trial.type +
                                        " plugin.");
                                }
                                else {
                                    trial[param][i][p] = trial.type.info.parameters[param].nested[p].default;
                                }
                            }
                        }
                    });
                }
            }
            // if it's not nested, checking is much easier and do that here:
            else if (typeof trial[param] === "undefined" || trial[param] === null) {
                if (typeof trial.type.info.parameters[param].default === "undefined") {
                    console.error("You must specify a value for the " +
                        param +
                        " parameter in the " +
                        trial.type +
                        " plugin.");
                }
                else {
                    trial[param] = trial.type.info.parameters[param].default;
                }
            }
        }
    }
    checkExclusions(exclusions) {
        return Utils.__awaiter(this, void 0, void 0, function* () {

            if (exclusions.min_width || exclusions.min_height || exclusions.audio) {
                console.warn("The exclusions option in `initJsPsych()` is deprecated and will be removed in a future version. We recommend using the browser-check plugin instead. See https://www.jspsych.org/latest/plugins/browser-check/.");
            }
            // MINIMUM SIZE
            if (exclusions.min_width || exclusions.min_height) {
                const mw = exclusions.min_width || 0;
                const mh = exclusions.min_height || 0;
                if (window.innerWidth < mw || window.innerHeight < mh) {
                    this.getDisplayElement().innerHTML =
                        "<p>Your browser window is too small to complete this experiment. " +
                        "Please maximize the size of your browser window. If your browser window is already maximized, " +
                        "you will not be able to complete this experiment.</p>" +
                        "<p>The minimum width is " +
                        mw +
                        "px. Your current width is " +
                        window.innerWidth +
                        "px.</p>" +
                        "<p>The minimum height is " +
                        mh +
                        "px. Your current height is " +
                        window.innerHeight +
                        "px.</p>";
                    // Wait for window size to increase
                    while (window.innerWidth < mw || window.innerHeight < mh) {
                        yield delay(100);
                    }
                    this.getDisplayElement().innerHTML = "";
                }

            }
            // WEB AUDIO API
            if (typeof exclusions.audio !== "undefined" && exclusions.audio) {
                if (!window.hasOwnProperty("AudioContext") && !window.hasOwnProperty("webkitAudioContext")) {
                    this.getDisplayElement().innerHTML =
                        "<p>Your browser does not support the WebAudio API, which means that you will not " +
                        "be able to complete the experiment.</p><p>Browsers that support the WebAudio API include " +
                        "Chrome, Firefox, Safari, and Edge.</p>";
                    throw new Error();
                }
            }
        });
    }
    drawProgressBar(msg) {
        document
            .querySelector(".jspsych-display-element")
            .insertAdjacentHTML("afterbegin", '<div id="jspsych-progressbar-container">' +
                "<span>" +
                msg +
                "</span>" +
                '<div id="jspsych-progressbar-outer">' +
                '<div id="jspsych-progressbar-inner"></div>' +
                "</div></div>");
    }
    updateProgressBar() {
        this.setProgressBar(this.getProgress().percent_complete / 100);
    }
    setProgressBar(proportion_complete) {
        proportion_complete = Math.max(Math.min(1, proportion_complete), 0);
        document.querySelector("#jspsych-progressbar-inner").style.width =
            proportion_complete * 100 + "%";
        this.progress_bar_amount = proportion_complete;
    }
    getProgressBarCompleted() {
        return this.progress_bar_amount;
    }
    isInterrupt() {
        if(localStorage.getItem("jspsych-data")) {
            if(confirm("我们已经检测到你当前进行实验的时候存在中断的情况，请问是否接着继续？")) {
                this.recoveryStatus();
            } else {
                if(!confirm("如果要重新开始实验，请按确定键")) {
                    this.recoveryStatus();
                }
            }
        }
    }
    recordStatus() {
        this.pauseExperiment();
        localStorage.setItem("jspsych-data", this.data.get().json());
        this.resumeExperiment();
    }
    recoveryStatus() { 
        this.pauseExperiment();
        alert("当前准备恢复到你之前的数据，在此期间你无需进行任何操作，当数据加载完毕，会有提示框出现。");
        this.is_interrupt = true;
        (function(tmpData) {
            let mm = setInterval(function() {
                if(tmpData.length < 1) {
                    clearInterval(mm);
                    alert("当前数据已经恢复完毕，请继续实验");
                }
                if (jspsych.current_trial_finished == false && tmpData.length > 0) { 
                    jspsych.finishTrial(tmpData.splice(0,1)[0]);
                }
            }, 1);
        })(JSON.parse(localStorage.getItem("jspsych-data")));
        this.resumeExperiment();
    }
    clearStatus() {
        localStorage.removeItem("jspsych-data");
    }
}