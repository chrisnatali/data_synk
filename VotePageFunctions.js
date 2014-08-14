//divs used by rest of page
var status_section_div;
var input_section_div;
var output_section_div;

//Current user/survey/question
var current_userid;
var current_surveyid;
var current_questionid;
var current_voteid;

//button definitions
var user_submit_button = "<input type='button' name='login' value='Login' onclick='submit_user(this.parentNode);'/>";

var next_question_button =
    "<input type='button' name='question' value='Submit and Next Question' onclick='submit_vote_next(this.parentNode);'/>";
var next_question_update_button =
    "<input type='button' name='question' value='Update and Next Question' onclick='update_vote_next(this.parentNode);'/>";
var final_question_button =
    "<input type='button' name='question' value='Complete Survey' onclick='submit_vote_last(this.parentNode);'/>";
var final_question_update_button =
    "<input type='button' name='question' value='Update and Complete Survey' onclick='update_vote_last(this.parentNode);'/>";

var select_onchange_fun =
    "select_onchange(this)";

//figures out what to do next based on globals
function do_next() {
    if(current_userid == undefined) {
        //kick off a refresh of users, then display the form
        Controller.remote_update_handler = create_user_form;
        Controller.remote_sync_query('_entity=User');
    }
    else {
        //kick off a refresh of all entities, display the vote form upon return
        Controller.remote_update_handler = create_vote_form;
        Controller.remote_sync_query('_entity=**');
    }

}

//returns undefined if none found, the current_questionid if it's the last one
function get_next_question(survey_id, question_id) {
    var records = Controller.local_query('_entity=Question,&Survey=' + survey_id);
    var id = Common.get_next_value(records, '_&id', question_id, 0, 1);
    return id;
}

//see Domain.js for survey domain def's
function create_user_form() {
    //ensure that we have users...
    var records = Controller.local_query('_entity=User');
    if(records.length == 0) {
        input_section_div.innerHTML = "No Users in System.";
        return;
    }
    var str_array = [];
    str_array.push("<h2>Enter User Name</h2>");

    Forms.init(Domain.user);

    var buttons = [];
    buttons.push(user_submit_button);

    Forms.html_submit_buttons = buttons;

    var form_str = Forms.create_form();
    str_array.push(form_str);
    input_section_div.innerHTML = str_array.join("\n");
}

//check user, move on to the next step
function submit_user(frm) {
    for(var i = 0; i < frm.elements.length; i++) {
        var e = frm.elements[i];
        //should only be one text element...we want it's value
        if(e.type == "text") {
            var user = e.value;
            //look user up...if not available, flag the field
            //no need to filter out dirty recs here as this page isn't creating users
            var records = Controller.local_query("_entity=User,Name=" + user);
            if(records.length == 1) {
                var rec = records[0];
                current_userid = rec['_&id'];
                status_section_div.innerHTML = "<h2>User: " + user + "</h2>";
                do_next();  //moving along
            }
            else {
                e.className = "invalid";
                alert("User not found.");
            }
        }
    }
}

function create_vote_form() {
    var form_record = Domain.vote;
    Forms.init(form_record);

    //this will populate the scope_records with defaults
    //to be displayed later
    Forms.create_form();

    //do NOT display Vote.Answer.Question&, Vote.&Question or Vote.&User
    Forms.scope_invisible['Vote.Answer.&Question'] = 1;
    Forms.scope_invisible['Vote.Question.&Survey'] = 1;
    Forms.scope_invisible['Vote.Question.Survey.&User'] = 1;
    Forms.scope_invisible['Vote.&Question'] = 1;
    Forms.scope_invisible['Vote.&User'] = 1;

    //set user-friendly names
    Forms.scope_id_field_name['Vote.Answer.Question.Survey.&User'] = "Survey User";
    Forms.scope_id_field_name['Vote.Answer.Question.&Survey'] = "Survey";

    //set the remote handler to nothing..as once a vote is submitted, we're moving on
    Controller.remote_update_handler = 0;
    update_vote_form_and_display();

}

//to be called anytime local entity record we're interested in changes
function update_vote_selection_id(id) {
    current_voteid = id;

    //udpate happens in display function b/c higher scopes are set in there
    //therefore this would be undefined

    //only update the display, don't reinit the form
    update_vote_form_and_display();

}

//get the id and update the display
function update_vote_select_id_helper(element) {
    var id = element.getAttribute('_&id');
    update_vote_selection_id(id);
}

//handle select_onchange
function select_onchange(element) {
    var scope_record = Forms.process_change(element);

    if(scope_record['_scope_id'] == 'Vote.Answer') {
        //do nothing...it's just the answer selection
    }
    else {
        //more important stuff changed
        current_voteid = undefined;
        current_questionid = undefined;

        //this will populate the scope_records with defaults
        //to be displayed later
        Forms.create_form();

        update_vote_form_and_display();
    }
}

//redisplay
function update_vote_form_and_display() {

    //get the current Survey
    var survey_id = Forms.get_scope_id_value('Vote.Answer.Question.&Survey');
    if(survey_id == undefined) {
        Forms.html_submit_buttons = [];
        Forms.select_onchange_fun_str = select_onchange_fun;
        update_vote_form_display("No Surveys");
        return;
    }

    //set the current_questionid if not already done
    if(current_questionid == undefined) {
        var id = get_next_question(survey_id);
        if(id == undefined) {
            Forms.html_submit_buttons = [];
            Forms.select_onchange_fun_str = select_onchange_fun;
            update_vote_form_display("No Questions");
            return;
        }
        current_questionid = id;
    }

    //set the Question related scope recs
    Common.dbg("question_id: " + current_questionid);
    var question_rec = Controller.get_record(current_questionid);

    //ensure that there are answers
    var query = '_entity=Answer,&Question=' + current_questionid;
    var results = Controller.local_query(query);
    if(results.length == 0) {
        Forms.html_submit_buttons = [];
        Forms.select_onchange_fun_str = select_onchange_fun;
        update_vote_form_display("No Answers...Question: " + question_rec['Question']);
        return;
    }


    Forms.set_scope_can_record(question_rec, 'Vote.Answer'); //order matters
    Forms.set_scope_can_record(question_rec, 'Vote');
    //set the user here as well...
    var user_rec = Controller.get_record(current_userid);
    Forms.set_scope_can_record(user_rec, 'Vote');

    if(current_voteid != undefined) {
        var vote_rec = Controller.get_record(current_voteid);
        Forms.set_scope_can_record(vote_rec);
    }

    //set the handlers
    var button_handlers = [];

    //we know we have a questionid, see if it's the last one
    var next_q_id = get_next_question(survey_id, current_questionid);
    if(next_q_id == current_questionid) {
        //it's the last q
        button_handlers.push(final_question_button);
        if(current_voteid != undefined) {
            button_handlers.push(final_question_update_button);
        }
    }
    else {
        button_handlers.push(next_question_button);
        if(current_voteid != undefined) {
            button_handlers.push(next_question_update_button);
        }
    }

    Forms.html_submit_buttons = button_handlers;
    Forms.select_onchange_fun_str = select_onchange_fun;

    //no need....yet: update_vote_form_display();
    update_vote_form_display("<br/><h2>Question: " + question_rec['Question'] + "</h2>");
}

function update_vote_form_display(answer_prefix_string) {
    //create form/display
    //id_prefix is in context of a table
    Forms.scope_id_prefix['Vote.Answer'] = "<tr><td>" + answer_prefix_string + "</td></tr>";
    var form_str = Forms.create_form();
    var prefix;
    prefix = "<h2>Select Survey by User</h2>";
    input_section_div.innerHTML = prefix + form_str;

    //also update the entity list as it's dependent on Forms.scope_records
    update_vote_edit_list();
}


//handle update
function update_vote_next(frm) {
    Forms.process_form(frm);
    var record = Forms.get_can_record();
    //need to add _&id fld for updates
    record['_&id'] = current_voteid;
    if(!validate_record(record)) {
        return false;
    }
    var survey_id = Forms.get_scope_id_value('Vote.Answer.Question.&Survey');
    current_questionid = get_next_question(survey_id, current_questionid);
    current_voteid = undefined;
    update_vote_form_and_display();
    submit_record(record);
    return false;
}

//handle create
function submit_vote_next(frm) {
    Forms.process_form(frm);
    var record = Forms.get_can_record();
    if(!validate_record(record)) {
        return false;
    }
    var survey_id = Forms.get_scope_id_value('Vote.Answer.Question.&Survey');
    current_questionid = get_next_question(survey_id, current_questionid);
    current_voteid = undefined;
    update_vote_form_and_display();
    submit_record(record);
    return false;
}

//handle update last
function update_vote_last(frm) {
    Forms.process_form(frm);
    var record = Forms.get_can_record();
    //need to add _&id fld for updates
    record['_&id'] = current_voteid;
    if(!validate_record(record)) {
        return false;
    }
    input_section_div.innerHTML = "Survey Completed.  Thank You.";
    current_questionid = undefined;  //don't forget...or we'll keep coming back
    current_voteid = undefined;
    Controller.remote_update_handler = create_vote_form;
    submit_record(record);
    return false;
}

//handle create last
function submit_vote_last(frm) {
    Forms.process_form(frm);
    var record = Forms.get_can_record();
    if(!validate_record(record)) {
        return false;
    }
    input_section_div.innerHTML = "Survey Completed.  Thank You.";
    current_questionid = undefined;  //don't forget...or we'll keep coming back
    current_voteid = undefined;
    Controller.remote_update_handler = create_vote_form;
    submit_record(record);
    return false;
}

//validate, save and flush record
function submit_record(record) {
    Controller.local_persist(record);
    Controller.flush();
}

function validate_record(record) {
    if(!Domain.validate_record(record)) {
        alert("The form is incompletely or incorrectly filled out.\n" +
              "error: " + Domain.validation_error + "\n" +
              "Please correct the error and try again.\n");
        return 0;
    }
    return 1;
}

function update_vote_edit_list() {

    //WARNING:  We access Forms.scope_records directly here...this should
    //          be encapsulated better.

    //if there we don't know parent-rel values yet, don't display anything
    if(!Domain.scope_has_parent_values('Vote', Forms.scope_records)) {
        output_section_div.innerHTML = "";
        return;
    }

    var query = '_entity=Vote,_dirty=0';



    //add filter by current form scope
    //current_entity is scope
    var filter_str = Domain.get_scope_filter('Vote', Forms.scope_records);
    if(filter_str != "") {
        query = query + ',' + filter_str;
    }

    //create html to populate listing with
    var str_array = [];
    var records = Controller.local_query(query);
    for(var i in records) {
        record = records[i];
        var id = record['_&id'];
        var cls = "record";
        if(id == current_voteid) {
            cls = "selected_record";
        }
        var ent_view = "Vote Answer: " + record['Answer'];

        //when selected, need to update both the entity_edit_list & the entity_edit 'windows'
        var update_entity_funcall = "update_vote_select_id_helper(this);";
        var edit_div = "<div _&id='" + id + "' _entity='vote' class=" + cls + " onmousedown='" + update_entity_funcall + "'>";
        edit_div += ent_view + "</div>";
        str_array.push(edit_div);
    }

    var user_rec = Controller.get_record(current_userid);
    var prefix = "<h2>Answers for user: " + user_rec['Name'] + " (select to edit)</h2>";
    output_section_div.innerHTML = prefix + str_array.join(" ");
}

function load() {

    //setup Controller
    Controller.remote_url = "cgi-bin/data_synk.cgi";
    Controller.init("cgi-bin/data_synk.cgi", document, "msg_section");

    //setup div's
    status_section_div = document.getElementById("status_section");
    input_section_div = document.getElementById("input_section");
    output_section_div = document.getElementById("output_section");

    //get started
    do_next();
}