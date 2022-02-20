jspsych.plugins["get-the-physical-size-of-the-screen"] = (function () {
    'use strict';

    const info = {
        name: "get-the-physical-size-of-the-screen",
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

    class GetThePhysicalSizeOfTheScreen {
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
    GetThePhysicalSizeOfTheScreen.info = info;
    return GetThePhysicalSizeOfTheScreen;
})();