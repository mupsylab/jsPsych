/*
 * Example plugin template
 */

if (typeof (jspsychPlugins) != "object") { var jspsychPlugins = {} }
jspsychPlugins["SALT"] = (function () {
  'use strict';

  const info = {
    name: "SALT",
    parameters: {
      stimuli: {
        type: jsPsych.ParameterType.COMPLEX, // This is similar to the quesions of the survey-likert. 
        array: true,
        pretty_name: 'Stimuli',
        nested: {
          show_start_time: {
            type: jsPsych.ParameterType.INT,
            pretty_name: 'Show start time',
            default: 0
          },
          show_end_time: {
            type: jsPsych.ParameterType.INT,
            pretty_name: 'Show end time',
            default: null
          },
          v_angle: {
            type: jsPsych.ParameterType.INT,
            pretty_name: 'View angle',
            default: 1
          },
          color: {
            type: jsPsych.ParameterType.STRING,
            pretty_name: "Color",
            default: "white"
          },
          lineWidth: {
            type: jsPsych.ParameterType.INT,
            pretty_name: 'line width',
            default: 5
          },
          bias_angle: {
            type: jsPsych.ParameterType.INT,
            pretty_name: 'bias angle',
            default: 0
          },
          obj_type: {
            type: jsPsych.ParameterType.STRING,
            pretty_name: "Obj type",
            default: null
          },
          content: {
            type: jsPsych.ParameterType.STRING,
            pretty_name: "Content",
            default: null
          }
        }
      },
      distance: {
        type: jsPsych.ParameterType.INT,
        default: 500
      },
      screen: {
        type: jsPsych.ParameterType.COMPLEX,
        description: "Screen related information",
        nested: {
          pixelW: {
            type: jsPsych.ParameterType.INT,
            default: 1440,
            description: 'Screen width pixels.'
          },
          pixelH: {
            type: jsPsych.ParameterType.INT,
            default: 900,
            description: 'Screen height pixels.'
          },
          actualW: {
            type: jsPsych.ParameterType.INT,
            default: 1440,
            description: 'Actual screen width size. The unit is mm.'
          },
          actualH: {
            type: jsPsych.ParameterType.INT,
            default: 1440,
            description: 'Actual screen height size. The unit is mm.'
          }
        }
      },
      canvas_width: {
        type: jsPsych.ParameterType.INT,
        pretty_name: 'Canvas width',
        default: window.innerWidth * 0.9
      },
      canvas_height: {
        type: jsPsych.ParameterType.INT,
        pretty_name: 'Canvas height',
        default: window.innerHeight * 0.9
      },
      background_color: {
        type: jsPsych.ParameterType.STRING,
        pretty_name: 'Background color',
        default: 'grey'
      },
      trial_duration: {
        type: jsPsych.ParameterType.INT,
        pretty_name: "Trial duration",
        default: 2600
      },
      choices_match: {
        type: jsPsych.ParameterType.KEYS,
        pretty_name: "Choices Match",
        default: ["m"],
      },
      choices_mismatch: {
        type: jsPsych.ParameterType.KEYS,
        pretty_name: "Choices Mismatch",
        default: ["n"],
      },
      response_start_time: {
        type: jsPsych.ParameterType.INT,
        pretty_name: "Response start time",
        default: 1100
      },
      condition: {
        type: jsPsych.ParameterType.STRING,
        pretty_name: 'Matching status',
        default: ''
      },
      shape_association: {
        type: jsPsych.ParameterType.STRING,
        pretty_name: 'Graphic meaning',
        default: ''
      },
      feedback: {
        type: jsPsych.ParameterType.BOOL,
        default: false
      },
      feedback_correct: {
        type: jsPsych.ParameterType.STRING,
        default: "<span style='color: green;'>correct</span>"
      },
      feedback_wrong: {
        type: jsPsych.ParameterType.STRING,
        default: "<span style='color: red;'>error</span>"
      },
      feedback_overtime: {
        type: jsPsych.ParameterType.STRING,
        default: "<span style='color: yellow;'>too slow</span>"
      },
      feedback_duration: {
        type: jsPsych.ParameterType.INT,
        default: 500
      },
      stimuli_text: {
        type: jsPsych.ParameterType.STRING,
        default: ""
      },
      stimuli_img: {
        type: jsPsych.ParameterType.STRING,
        default: ""
      },
    }
  }

  class SALT {
    constructor(jspsych) {
      this.jspsych = jspsych;
    }
    trial(display_element, trial) {
      let stim_info = {
        word: "",
        img: ""
      };
      class visual_stimulus {
        constructor(stim) {
          Object.assign(this, stim)
          const keys = Object.keys(this)
          for (var i = 0; i < keys.length; i++) {
            if (typeof this[keys[i]] === "function") {
              // オブジェクト内のfunctionはここで指定する必要がある。そうしないとここで即時に実行されて、その結果が関数名に代入される
              if (keys[i] === "drawFunc") continue
              if (keys[i] === "change_attr") continue
              if (keys[i] === "mask_func") continue

              this[keys[i]] = this[keys[i]].call()
            }
          }
        }
      }

      class cross_stimulus extends visual_stimulus {
        constructor(stim) {
          super(stim);
        }
        show() {
          ctx.beginPath();
          ctx.lineWidth = this.lineWidth ? this.lineWidth : 5;
          ctx.strokeStyle = this.color ? this.color : "white";
          let pW = Utils.getPixe(trial.distance, this.v_angle, trial.screen.pixelW, trial.screen.actualW),
            pH = Utils.getPixe(trial.distance, this.v_angle, trial.screen.pixelH, trial.screen.actualH);

          ctx.moveTo(trial.canvas_width / 2, trial.canvas_height / 2 - pW / 2);
          ctx.lineTo(trial.canvas_width / 2, trial.canvas_height / 2 + pW / 2);
          ctx.moveTo(trial.canvas_width / 2 - pH / 2, trial.canvas_height / 2);
          ctx.lineTo(trial.canvas_width / 2 + pH / 2, trial.canvas_height / 2);
          ctx.stroke();
        }
      }

      class image_stimulus extends visual_stimulus {
        constructor(stim) {
          super(stim);
        }
        show() {
          let img = new Image();
          img.src = this.content;
          stim_info["img"] = this.content;

          let pW = Utils.getPixe(
            trial.distance, this.v_angle, trial.screen.pixelW, trial.screen.actualW, this.bias_angle
          )
          let pH = Utils.getPixe(
            trial.distance, this.v_angle, trial.screen.pixelH, trial.screen.actualH, this.bias_angle
          )
          // console.log(this.pW, this.pH);
          ctx.drawImage(
            img,
            0, 0, img.width, img.height,
            trial.canvas_width / 2 - pW / 2,
            trial.canvas_height / 2 - Utils.getPixe(
              trial.distance, this.bias_angle, trial.screen.pixelH, trial.screen.actualH
            ) - pH / 2,
            pW, pH
          );

        }
      }

      class text_stimulus extends visual_stimulus {
        constructor(stim) {
          super(stim);
        }
        show() {
          stim_info["word"] = this.content;
          let pH = Utils.getPixe(
            trial.distance, this.v_angle, trial.screen.pixelH, trial.screen.actualH, this.bias_angle
          )
          ctx.font = `${pH}px Arual`
          ctx.fillStyle = this.color ? this.color : "white";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle"

          ctx.fillText(
            this.content,
            trial.canvas_width / 2,
            trial.canvas_height / 2 + Utils.getPixe(
              trial.distance, this.bias_angle, trial.screen.pixelH, trial.screen.actualH
            ) + pH / 4
          );
        }
      }
      let cv = document.createElement("canvas");
      let ctx = cv.getContext("2d");

      cv.height = trial.canvas_height;
      cv.width = trial.canvas_width;
      cv.style.backgroundColor = trial.background_color;
      display_element.appendChild(cv);

      const stimulus = {
        text: text_stimulus,
        image: image_stimulus,
        cross: cross_stimulus
      }
      let oop_stim = [];
      for (let i of trial.stimuli) {
        if (!i.obj_type) {
          alert('You have missed to specify the obj_type property in the ' + (i + 1) + 'th object.');
          return
        }
        if (!i.content) {
          switch(i.obj_type) {
            case "text":
              i.content = trial.stimuli_text;
              break;
            case "image":
              i.content = trial.stimuli_img;
              break;
          }
        }
        oop_stim.push(new stimulus[i.obj_type](i));
      }

      function step() {
        ctx.clearRect(0, 0, cv.width, cv.height);
        let elapsedTime = performance.now() - start_time;

        for (let i of oop_stim) {
          if (elapsedTime > i.show_start_time && (!i.show_end_time || elapsedTime <= i.show_end_time)) {
            i.show()
          }
        }

      }

      // function to end trial when it is time
      var end_trial = (info) => {
        // kill keyboard listeners
        if (typeof keyboardListener !== 'undefined') {
          this.jspsych.pluginAPI.cancelKeyboardResponse(keyboardListener);
        }
        clearInterval(intervalID);
        // gather the data to store for the trial
        // console.log(trial);
        var trial_data = {
          rt: info ? info.rt : null,
          key_press: info ? info.key : null,
          stim_word: stim_info["word"],
          stim_img: stim_info["img"],
          condition: trial.condition,
          shape_association: trial.shape_association,
          response: info ? 
            (trial.choices_match.indexOf(info.key) >= 0 & stim_info["word"] == trial.shape_association ? 1 : (
              trial.choices_mismatch.indexOf(info.key) >= 0 & stim_info["word"] != trial.shape_association ? 1 : 0
            )) : 0
        };

        if(trial.feedback) {
          if(trial_data.response == 1) {
            display_element.innerHTML = trial.feedback_correct;
          } else if (trial_data.rt == null) {
            display_element.innerHTML = trial.feedback_overtime;
          } else {
            display_element.innerHTML = trial.feedback_wrong;
          }
          this.jspsych.pluginAPI.setTimeout(
            () => { close(trial_data); },
            trial.feedback_duration
          );
        } else {
          close(trial_data);
        }
      };

      var close = (trial_data) => {
        // clear the display
        display_element.innerHTML = '';
        // kill any remaining setTimeout handlers
        this.jspsych.pluginAPI.clearAllTimeouts();
        // move on to the next trial
        this.jspsych.finishTrial(trial_data);
      };

      const start_time = performance.now();
      var intervalID = setInterval(step, 1);
      var keyboardListener;
      this.jspsych.pluginAPI.setTimeout(() => {
        if (trial.choices_match != "NO_KEYS" & trial.choices_mismatch != "NO_KEYS") {
          keyboardListener = this.jspsych.pluginAPI.getKeyboardResponse({
            callback_function: end_trial,
            valid_responses: [].concat(trial.choices_match, trial.choices_mismatch),
            rt_method: "performance",
            persist: false,
            allow_held_key: false,
          });
        }
      }, trial.response_start_time);
      if (trial.trial_duration) {
        this.jspsych.pluginAPI.setTimeout(
          end_trial,
          trial.trial_duration
        );
      }
    };
  }
  SALT.info = info;
  return SALT;
})();
