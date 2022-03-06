if(typeof(jspsychPlugins) != "object") { var jspsychPlugins = {} }
jspsychPlugins["PLUGIN-NAME"] = (function () {
    'use strict';

    const info = {
        name: "PLUGIN-NAME",
        parameters: {
            parameter_name: {
                type: jsPsych.ParameterType.INT, // BOOL, STRING, INT, FLOAT, FUNCTION, KEY, SELECT, HTML_STRING, IMAGE, AUDIO, VIDEO, OBJECT, COMPLEX
                default: undefined
            },
            parameter_name: {
                type: jsPsych.ParameterType.IMAGE,
                default: undefined
            }
        }
    }

    class Plugin {
        constructor(jspsych) { 
            this.jspsych = jspsych
        }
        trial(display_element, trial) {
            // data saving
            var trial_data = {
                parameter_name: 'parameter value'
            };

            // end trial
            this.jspsych.finishTrial(trial_data);
        }
    }
    Plugin.info = info;
    return Plugin;
})();