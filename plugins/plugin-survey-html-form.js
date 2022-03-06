if(typeof(jspsychPlugins) != "object") { var jspsychPlugins = {} }
jspsychPlugins["survey-html-form"] = (function () {
  'use strict';

  const info = {
      name: "survey-html-form",
      parameters: {
          /** HTML formatted string containing all the input elements to display. Every element has to have its own distinctive name attribute. The <form> tag must not be included and is generated by the plugin. */
          html: {
              type: jsPsych.ParameterType.HTML_STRING,
              pretty_name: "HTML",
              default: null,
          },
          /** HTML formatted string to display at the top of the page above all the questions. */
          preamble: {
              type: jsPsych.ParameterType.HTML_STRING,
              pretty_name: "Preamble",
              default: null,
          },
          /** The text that appears on the button to finish the trial. */
          button_label: {
              type: jsPsych.ParameterType.STRING,
              pretty_name: "Button label",
              default: "Continue",
          },
          /** The HTML element ID of a form field to autofocus on. */
          autofocus: {
              type: jsPsych.ParameterType.STRING,
              pretty_name: "Element ID to focus",
              default: "",
          },
          /** Retrieve the data as an array e.g. [{name: "INPUT_NAME", value: "INPUT_VALUE"}, ...] instead of an object e.g. {INPUT_NAME: INPUT_VALUE, ...}. */
          dataAsArray: {
              type: jsPsych.ParameterType.BOOL,
              pretty_name: "Data As Array",
              default: false,
          },
          /** Setting this to true will enable browser auto-complete or auto-fill for the form. */
          autocomplete: {
              type: jsPsych.ParameterType.BOOL,
              pretty_name: "Allow autocomplete",
              default: false,
          },
      },
  };
  /**
   * **survey-html-form**
   *
   * jsPsych plugin for displaying free HTML forms and collecting responses from all input elements
   *
   * @author Jan Simson
   * @see {@link https://www.jspsych.org/plugins/jspsych-survey-html-form/ survey-html-form plugin documentation on jspsych.org}
   */
  class SurveyHtmlFormPlugin {
      constructor(jsPsych) {
          this.jsPsych = jsPsych;
      }
      trial(display_element, trial) {
          var html = "";
          // show preamble text
          if (trial.preamble !== null) {
              html +=
                  '<div id="jspsych-survey-html-form-preamble" class="jspsych-survey-html-form-preamble">' +
                      trial.preamble +
                      "</div>";
          }
          // start form
          if (trial.autocomplete) {
              html += '<form id="jspsych-survey-html-form">';
          }
          else {
              html += '<form id="jspsych-survey-html-form" autocomplete="off">';
          }
          // add form HTML / input elements
          html += trial.html;
          // add submit button
          html +=
              '<input type="submit" id="jspsych-survey-html-form-next" class="jspsych-btn jspsych-survey-html-form" value="' +
                  trial.button_label +
                  '"></input>';
          html += "</form>";
          display_element.innerHTML = html;
          if (trial.autofocus !== "") {
              var focus_elements = display_element.querySelectorAll("#" + trial.autofocus);
              if (focus_elements.length === 0) {
                  console.warn("No element found with id: " + trial.autofocus);
              }
              else if (focus_elements.length > 1) {
                  console.warn('The id "' + trial.autofocus + '" is not unique so autofocus will not work.');
              }
              else {
                  focus_elements[0].focus();
              }
          }
          display_element
              .querySelector("#jspsych-survey-html-form")
              .addEventListener("submit", (event) => {
              // don't submit form
              event.preventDefault();
              // measure response time
              var endTime = performance.now();
              var response_time = Math.round(endTime - startTime);
              var this_form = display_element.querySelector("#jspsych-survey-html-form");
              var question_data = serializeArray(this_form);
              if (!trial.dataAsArray) {
                  question_data = objectifyForm(question_data);
              }
              // save data
              var trialdata = {
                  rt: response_time,
                  response: question_data,
              };
              display_element.innerHTML = "";
              // next trial
              this.jsPsych.finishTrial(trialdata);
          });
          var startTime = performance.now();
          /**
           * Serialize all form data into an array
           * @copyright (c) 2018 Chris Ferdinandi, MIT License, https://gomakethings.com
           * @param  {Node}   form The form to serialize
           * @return {String}      The serialized form data
           */
          function serializeArray(form) {
              // Setup our serialized data
              var serialized = [];
              // Loop through each field in the form
              for (var i = 0; i < form.elements.length; i++) {
                  var field = form.elements[i];
                  // Don't serialize fields without a name, submits, buttons, file and reset inputs, and disabled fields
                  if (!field.name ||
                      field.disabled ||
                      field.type === "file" ||
                      field.type === "reset" ||
                      field.type === "submit" ||
                      field.type === "button")
                      continue;
                  // If a multi-select, get all selections
                  if (field.type === "select-multiple") {
                      for (var n = 0; n < field.options.length; n++) {
                          if (!field.options[n].selected)
                              continue;
                          serialized.push({
                              name: field.name,
                              value: field.options[n].value,
                          });
                      }
                  }
                  // Convert field data to a query string
                  else if ((field.type !== "checkbox" && field.type !== "radio") || field.checked) {
                      serialized.push({
                          name: field.name,
                          value: field.value,
                      });
                  }
              }
              return serialized;
          }
          // from https://stackoverflow.com/questions/1184624/convert-form-data-to-javascript-object-with-jquery
          function objectifyForm(formArray) {
              //serialize data function
              var returnArray = {};
              for (var i = 0; i < formArray.length; i++) {
                  returnArray[formArray[i]["name"]] = formArray[i]["value"];
              }
              return returnArray;
          }
      }
  }
  SurveyHtmlFormPlugin.info = info;

  return SurveyHtmlFormPlugin;

})();
