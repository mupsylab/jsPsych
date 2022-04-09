if(typeof(jspsychPlugins) != "object") { var jspsychPlugins = {} }
jspsychPlugins["get-screen-size"] = (function () {
    'use strict';

    const info = {
        name: "get-screen-size",
        parameters: {
            /** The height of the item to be measured, the unit is mm. */
            item_height: {
                type: jsPsych.ParameterType.INT,
                pretty_name: "Item height",
                default: 54,
            },
            /** The width of the item to be measured, the unit is mm. */
            item_width: {
                type: jsPsych.ParameterType.INT,
                pretty_name: "Item width",
                default: 85.5,
            },
            /** The content displayed below the resizable box and above the button. */
            prompt: {
                type: jsPsych.ParameterType.HTML_STRING,
                pretty_name: "Prompt",
                default: null,
            },
            /** The initial size of the box, in pixels, along the larget dimension. */
            starting_size: {
                type: jsPsych.ParameterType.INT,
                pretty_name: "Starting size",
                default: 100,
            },
            /** Label to display on the button to complete calibration. */
            button_label: {
                type: jsPsych.ParameterType.STRING,
                pretty_name: "Button label",
                default: "Continue",
            },
        },
    };
    /**
     * **get screen size**
     *
     * jsPsych plugin for getting the actual screen size and pixel size
     *
     * @author 
     * @see {@link # get-screen-size plugin documentation on jspsych.org}
     */
    class GetScreenSize {
        constructor(jsPsych) {
            this.jsPsych = jsPsych;
        }
        trial(display_element, trial) {
            var aspect_ratio = trial.item_width / trial.item_height;
            // variables to determine div size
            if (trial.item_width >= trial.item_height) {
                var start_div_width = trial.starting_size;
                var start_div_height = Math.round(trial.starting_size / aspect_ratio);
            }
            else {
                var start_div_height = trial.starting_size;
                var start_div_width = Math.round(trial.starting_size * aspect_ratio);
            }
            // create html for display
            var html = '<div id="jspsych-get-screen-size-div" style="border: 2px solid steelblue; height: ' +
                start_div_height +
                "px; width:" +
                start_div_width +
                'px; margin: 7px auto; background-color: lightsteelblue; position: relative;">';
            html +=
                '<div id="jspsych-get-screen-size-handle" style="cursor: nwse-resize; background-color: steelblue; width: 10px; height: 10px; border: 2px solid lightsteelblue; position: absolute; bottom: 0; right: 0;"></div>';
            html += "</div>";
            if (trial.prompt !== null) {
                html += trial.prompt;
            }
            html += '<a class="jspsych-btn" id="jspsych-get-screen-size-btn">' + trial.button_label + "</a>";
            // render
            display_element.innerHTML = html;
            // function to end trial
            const end_trial = () => {
                // clear document event listeners
                document.removeEventListener("mousemove", resizeevent);
                document.removeEventListener("mouseup", mouseupevent);
                // get the pixel of the screen
                let cal_height = document.querySelector("#jspsych-get-screen-size-div").clientHeight,
                    cal_width = document.querySelector("#jspsych-get-screen-size-div").clientWidth,
                    screen_width = window.screen.width,
                    screen_height = window.screen.height;
                // clear the screen
                display_element.innerHTML = "";
                // finishes trial
                var trial_data = {
                    screen_width_pixel: screen_width,
                    screen_width_physics: screen_width * ((trial.item_width > trial.item_height ? trial.item_width : trial.item_height) / cal_width),
                    screen_height_physics: screen_height * ((trial.item_width > trial.item_height ? trial.item_height : trial.item_width) / cal_height),
                    screen_height_pixel: screen_height,
                };
                this.jsPsych.finishTrial(trial_data);
            };
            // listens for the click
            document.getElementById("jspsych-get-screen-size-btn").addEventListener("click", () => {
                end_trial();
            });
            var dragging = false;
            var origin_x, origin_y;
            var cx, cy;
            var mousedownevent = (e) => {
                e.preventDefault();
                dragging = true;
                origin_x = e.pageX;
                origin_y = e.pageY;
                cx = parseInt(scale_div.style.width);
                cy = parseInt(scale_div.style.height);
            };
            display_element
                .querySelector("#jspsych-get-screen-size-handle")
                .addEventListener("mousedown", mousedownevent);
            var mouseupevent = (e) => {
                dragging = false;
            };
            document.addEventListener("mouseup", mouseupevent);
            var scale_div = display_element.querySelector("#jspsych-get-screen-size-div");
            var resizeevent = (e) => {
                if (dragging) {
                    var dx = e.pageX - origin_x;
                    var dy = e.pageY - origin_y;
                    if (Math.abs(dx) >= Math.abs(dy)) {
                        scale_div.style.width = Math.round(Math.max(20, cx + dx * 2)) + "px";
                        scale_div.style.height = Math.round(Math.max(20, cx + dx * 2) / aspect_ratio) + "px";
                    }
                    else {
                        scale_div.style.height = Math.round(Math.max(20, cy + dy * 2)) + "px";
                        scale_div.style.width = Math.round(aspect_ratio * Math.max(20, cy + dy * 2)) + "px";
                    }
                }
            };
            document.addEventListener("mousemove", resizeevent);
        }
        simulate(trial, simulation_mode, simulation_options, load_callback) {
            if (simulation_mode == "data-only") {
                load_callback();
                this.simulate_data_only(trial, simulation_options);
            }
            if (simulation_mode == "visual") {
                this.simulate_visual(trial, simulation_options, load_callback);
            }
        }
        create_simulation_data(trial, simulation_options) {
            const default_data = {
                screen_width_pixel: window.innerWidth,
                screen_width_physics: window.innerWidth,
                screen_height_physics: window.innerHeight,
                screen_height_pixel: window.innerHeight,
            };
            const data = this.jsPsych.pluginAPI.mergeSimulationData(default_data, simulation_options);
            return data;
        }
        simulate_data_only(trial, simulation_options) {
            const data = this.create_simulation_data(trial, simulation_options);
            this.jsPsych.finishTrial(data);
        }
        simulate_visual(trial, simulation_options, load_callback) {
            const display_element = this.jsPsych.getDisplayElement();
            this.trial(display_element, trial);
            load_callback();
            if (data.rt !== null) {
                this.jsPsych.pluginAPI.clickTarget(display_element.querySelector(`#jspsych-get-screen-size-btn`), data.rt);
            }
        }
    }
    GetScreenSize.info = info;

    return GetScreenSize;

})();
