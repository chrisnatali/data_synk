//divs used by rest of page
var status_section_div;
var input_section_div;
var output_section_div;

//Current user/survey/question
var current_userid;
var current_surveyid;
var current_questionid;

var select_onchange_fun = "select_onchange(this)";

function create_report_form() {
    var form_record = Domain.answer;
    Forms.init(form_record);

    //this will populate the scope_records with defaults
    //to be displayed later
    Forms.create_form();

    //do NOT display Answer.Name
    Forms.scope_invisible['Answer.Answer'] = 1;

    //set user-friendly names
    Forms.scope_id_field_name['Answer.Question.Survey.&User'] = "Survey User";
    Forms.scope_id_field_name['Answer.Question.&Survey'] = "Survey";
    Forms.scope_id_field_name['Answer.&Question'] = "Question";

    Forms.scope_allow_all['Answer.&Question'] = "All";

    //set onchange handler here cuz this won't change
    Forms.select_onchange_fun_str = select_onchange_fun;

    //set the remote handler to nothing..we're done setting up this form
    Controller.remote_update_handler = 0;
    update_globals_from_scope();
    remote_update_survey();

}

function update_globals_from_scope() {

    //get the current User
    current_userid = Forms.get_scope_id_value('Answer.Question.Survey.&User');

    //get the current Survey
    current_surveyid = Forms.get_scope_id_value('Answer.Question.&Survey');

    //get the current_questionid
    current_questionid = Forms.get_scope_id_value('Answer.&Question');
}

function remote_update_survey() {

    if(current_surveyid != undefined) {
        //there's a current_surveyid, so query for all users/surveys and all children of current survey
        //this should minimize impact on client supposed there are a large # of votes
        Controller.remote_sync_query('_entity=**,Question.&Survey=' + current_surveyid);
        Controller.remote_update_handler = update_report_form_and_display;
    }
}

//handle select_onchange
function select_onchange(element) {
    var scope_record = Forms.process_change(element);
    Common.dbg("onchange");

    //more important stuff changed
    current_userid = undefined;
    current_surveyid = undefined;
    current_questionid = undefined;

    Common.dbg("redisplaying form");
    //this will populate the scope_records with defaults
    //to be displayed later
    Forms.create_form();


    //perform update if scope in this hash
    var do_survey_update = [];
    do_survey_update['Answer.Question.&Survey'] = 1;
    do_survey_update['Answer.Question.Survey.&User'] = 1;
    //if the surveyid changed, then requery
    update_globals_from_scope();
    if(do_survey_update[scope_record['_scope_id']]) {
        remote_update_survey();
    }
    else {
        //just redisplay what's there
        update_report_form_and_display();
    }
}

//redisplay
function update_report_form_and_display() {

    //this will populate the scope_records with defaults
    //to be displayed later
    Forms.create_form();
    update_globals_from_scope();

    if(current_userid == undefined) {
        update_report_form_display("No Users");
        return;
    }

    if(current_surveyid == undefined) {
        update_report_form_display("No Surveys");
        return;
    }

    if(current_questionid == undefined) {
        update_report_form_display("No Questions");
        return;
    }

    update_report_form_display();
}

function update_report_form_display(report_suffix_string) {
    //create form/display
    var form_str = Forms.create_form();
    var prefix;
    prefix = "<h2>Select Survey/Question for Report</h2>";
    if(report_suffix_string != undefined) {
        form_str += report_suffix_string;
    }
    input_section_div.innerHTML = prefix + form_str;

    update_report_display();
}

function update_report_display() {

    //if we don't have a current_questionid, display nothing
    if(current_questionid == undefined) {
        output_section_div.innerHTML = "";
        return;
    }

    //ditto for surveyid
    if(current_surveyid == undefined) {
        output_section_div.innerHTML = "";
        return;
    }

    var query;
    if(current_questionid == Domain.ALL_VALUE) {
        //filter for questions by survey id
        query = '_entity=Question,&Survey=' + current_surveyid;
    }
    else {
        //must have a valid questionid
        query = '_entity=Question,_&id=' + current_questionid;
    }

    var records = Controller.local_query(query);
    var report_arr = [];
    for(var i in records) {
        var rec = records[i];
        var qid = rec['_&id'];
        report_arr.push("<br/><h2>Vote Count for Question " + rec['Question'] + "</h2>");
        report_arr.push("<table>");
        var ans_ct = get_answer_count_hash(qid);
        for(var ans in ans_ct) {
            var report_str = "<tr><td class='report'>" + ans + "</td><td class='report'>" + ans_ct[ans] + "</td></tr>";
            //var report_str = "<tr class='report'><td>" + ans + "</td><td>" + ans_ct[ans] + "</td></tr>";
            report_arr.push(report_str);
        }
        report_arr.push("</table>");
    }
    output_section_div.innerHTML = report_arr.join("\n");
}

function get_answer_count_hash(question_id) {
    var answer_count = [];
    var records = Controller.local_query('_entity=Vote,&Question=' + question_id);
    //sort records by Answer (not really needed)
    //records.sort( function(a, b) { (a['Answer'] > b['Answer'] ? 1 : -1);  });
    for(var i in records) {
        var answer = records[i]['Answer'];
        if(answer != undefined) {
            if(answer_count[answer] == undefined) {
                answer_count[answer] = 0;
            }
            answer_count[answer] = answer_count[answer] + 1;
        }
    }
    return answer_count
}

function load() {

    //setup Controller
    Controller.remote_url = "cgi-bin/data_synk.cgi";
    Controller.init("cgi-bin/data_synk.cgi", document, "msg_section");

    //setup div's
    status_section_div = document.getElementById("status_section");
    input_section_div = document.getElementById("input_section");
    output_section_div = document.getElementById("output_section");

    //get only the users/surveys to start...questions, answers, votes will come later
    Controller.remote_sync_query('_entity=User/*2');
    Controller.remote_update_handler = create_report_form;
}