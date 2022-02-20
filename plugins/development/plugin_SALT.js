/*
 * Example plugin template
 */

jsPsych.plugins["SALT"] = (function () {
  'use strict';
  
    const info = {
      name: "SALT",
      parameters: {
        cross: {
          type: jsPsych.plugins.parameterType.OBJECT,
          default: {
            v_angle: 0.5,
            width: 5,
            color: "white"
          }
        },
        up_sti: {
          type: jsPsych.plugins.parameterType.OBJECT,
          default: {
            v_angle: 1.2,
            color: "white",
            bias_angle: 1.2
          }
        },
        down_sti: {
          type: jsPsych.plugins.parameterType.OBJECT,
          default: {
            v_angle: 1.2,
            color: "white",
            bias_angle: 1.2
          }
        },
        distance: {
          type: jsPsych.plugins.parameterType.INT,
          default: 500,
          description: "Distance to screen"
        },
        screen: {
          type: jsPsych.plugins.parameterType.COMPLEX,
          description: "Screen related information",
          nested: {
            pixelW: {
              type: jsPsych.plugins.parameterType.INT,
              default: 1440,
              description: 'Screen width pixels.'
            },
            pixelH: {
              type: jsPsych.plugins.parameterType.INT,
              default: 900,
              description: 'Screen height pixels.'
            },
            actualW: {
              type: jsPsych.plugins.parameterType.INT,
              default: 1440,
              description: 'Actual screen width size. The unit is mm.'
            },
            actualH: {
              type: jsPsych.plugins.parameterType.INT,
              default: 1440,
              description: 'Actual screen height size. The unit is mm.'
            }
          }
        },
        canvas_width: {
          type: jsPsych.plugins.parameterType.INT,
          pretty_name: 'Canvas width',
          default: window.innerWidth,
          description: 'The width of the canvas.'
        },
        canvas_height: {
          type: jsPsych.plugins.parameterType.INT,
          pretty_name: 'Canvas height',
          default: window.innerHeight,
          description: 'The height of the canvas.'
        },
        background_color: {
          type: jsPsych.plugins.parameterType.STRING,
          pretty_name: 'Background color',
          default: 'grey',
          description: 'The background color of the canvas.'
        },
      }
    }
  
    class SALT {
      constructor(jspsych) {
        this.jspsych = jspsych;
      }
      trial(display_element, trial) {
  
        let cv = document.createElement("canvas");
        let ctx = cv.getContext("2d");
    
        cv.height = trial.canvas_height;
        cv.width = trial.canvas_width;
        cv.style.backgroundColor = trial.background_color;
                          
        display_element.appendChild(cv);
        a = ctx;
        // first step: cross
        ctx.beginPath();
        ctx.lineWidth = trial.cross.width;
        ctx.strokeStyle = trial.cross.color;
        let pW = getPixe(trial.distance, trial.cross.v_angle, trial.screen.pixelW, trial.screen.actualW),
          pH = getPixe(trial.distance, trial.cross.v_angle, trial.screen.pixelH, trial.screen.actualH);
    
        ctx.moveTo(trial.canvas_width / 2, trial.canvas_height / 2 - pW);
        ctx.lineTo(trial.canvas_width / 2, trial.canvas_height / 2 + pW);
        ctx.moveTo(trial.canvas_width / 2 - pH, trial.canvas_height / 2);
        ctx.lineTo(trial.canvas_width / 2 + pH, trial.canvas_height / 2);
        ctx.stroke();
    
        // second step: img
        img = new Image();
        img.src = "./img/Cir.png";
        img.onload = function() { 
          this.pW = getPixe(
            trial.distance, trial.up_sti.v_angle, trial.screen.pixelW, trial.screen.actualW, trial.up_sti.bias_angle
          )
          this.pH = getPixe(
            trial.distance, trial.up_sti.v_angle, trial.screen.pixelH, trial.screen.actualH, trial.up_sti.bias_angle
          )
          console.log(this.pW, this.pH);
          ctx.drawImage(
            img, 
            0, 0, img.width, img.height,
            trial.canvas_width / 2 - this.pW / 2,
            trial.canvas_height / 2 - getPixe(
              trial.distance, trial.up_sti.bias_angle + trial.cross.v_angle, trial.screen.pixelH, trial.screen.actualH
            ) - this.pH,
            this.pW, this.pH
          );
        }
    
        // third step: word
        pH = getPixe(
          trial.distance, trial.down_sti.v_angle, trial.screen.pixelH, trial.screen.actualH, trial.down_sti.bias_angle
        )
        ctx.font = `${pH}px Arual`
        ctx.fillStyle = trial.down_sti.color;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle"
    
        ctx.fillText(
          "测试", 
          trial.canvas_width / 2, 
          trial.canvas_height / 2 + getPixe(
            trial.distance, trial.down_sti.bias_angle + trial.cross.v_angle / 2, trial.screen.pixelH, trial.screen.actualH
          ) + pH
        );
        // function to end trial when it is time
        var end_trial = function () {
    
          // kill any remaining setTimeout handlers
          jsPsych.pluginAPI.clearAllTimeouts();
    
          // kill keyboard listeners
          if (typeof keyboardListener !== 'undefined') {
            jsPsych.pluginAPI.cancelKeyboardResponse(keyboardListener);
          }
    
          // gather the data to store for the trial
          var trial_data = {
            rt: response.rt,
            response: response.key
          };
    
          // clear the display
          display_element.innerHTML = '';
    
          // move on to the next trial
          jsPsych.finishTrial(trial_data);
        };
    
        function getPixe(distance, vAngle, screenPixe, screenActual, biasAngle = 0) {
          // let goodsPixe, goodsActual;
          // goodsPixe / screenPixe = goodsActual / screenActual;
          // goodsActual / distanch = Math.tan(vAngle);
          if (biasAngle == 0) {
            return ((Math.tan(vAngle / 2 * Math.PI / 180) * distance) / screenActual) * screenPixe * 2;
          } else {
            return ((Math.tan((vAngle + biasAngle) * Math.PI / 180) * distance) / screenActual) * screenPixe - ((Math.tan(biasAngle * Math.PI / 180) * distance) / screenActual) * screenPixe;
          }
        }
      };
    }
    SALT.info = info;
    return SALT;
  })();
  