//divs used by rest of page
var status_section_div;
var entity_section_div;
var input_section_div;
var output_section_div;

//Current entity/id
var current_entity = "User";
var current_id;

//Form button definitions
var update_button_def =
    "<input type='button' name='update' value='Update' onclick='update_submit_handler(this.parentNode);'/>"; //update_submit_handler(this.parentNode);'/>";
var create_button_def =
    "<input type='button' name='create' value='Create New' onclick='create_submit_handler(this.parentNode);'/>"; //create_submit_handler(this.parentNode);'/>";
var select_onchange_fun =
    "select_onchange(this)";

//see Domain.js for survey domain def's
function create_entity_list_form() {
    var str_array = [];
    str_array.push("<form name='entities'>");
    str_array.push("<select name='entity' onchange='update_entity_select(this.options[this.selectedIndex].value);'>");
    for(var ent in Domain.entities) {
        var sel = "";
        if(ent == "User") {
            sel = "selected";
        }
        str_array.push("<option value='" + ent + "' " + sel + ">" + ent + "</option>");
    }
    str_array.push("</select>");
    str_array.push("</form>");
    return str_array.join("\n");
}

function update_entity_select(entity) {
    current_entity = entity;
    current_id = undefined;
    update_entity_edit(); //re-init/display edit form/select-list
}

//to be called anytime local entity record we're interested in changes
function update_entity_selection_id(id) {
    current_id = id;

    //setup the selected record
    var existing_record;
    if(current_id != undefined) {
        existing_record = Controller.get_record(current_id);
        Forms.set_scope_can_record(existing_record);
    }

    //only update the display, don't reinit the form
    update_edit_form_display();

}

//get the id and update the display
function update_entity_select_id_helper(element) {
    var id = element.getAttribute('_&id');
    update_entity_selection_id(id);
}

//init the entity edit form/display it
function update_entity_edit() {
    var form_record = Domain.entities[current_entity];
    Forms.init(form_record);
    update_edit_form_display();
}

//handle select_onchange
function select_onchange(element) {
    var scope_record = Forms.process_change(element);
    //unset the current_id as it doesn't make much sense after the relationships have changed
    //unless...it's a pseudo-rel
    if((scope_record == undefined) ||
       (!Domain.get_scope_record_is_pseudo_related(scope_record))) {
        current_id = undefined;
    }
    update_edit_form_display();
}

//redisplay
function update_edit_form_display() {

    //set the handlers
    var button_handlers = [];
    button_handlers.push(create_button_def); //set this for create handling
    if(current_id != undefined) {
        button_handlers.push(update_button_def); //set this for update handling
    }
    Forms.html_submit_buttons = button_handlers;
    Forms.select_onchange_fun_str = select_onchange_fun;

    //create form/display
    var form_str = Forms.create_form();
    var entity_prefix;
    entity_prefix = "<h2>Edit " + current_entity + "</h2>";
    input_section_div.innerHTML = entity_prefix + form_str;
    //also update the entity list as it's dependent on Forms.scope_records
    update_entity_edit_list();

}

//handle update
function update_submit_handler(frm) {
    Forms.process_form(frm);
    var record = Forms.get_can_record();
    //need to add _&id fld for updates
    record['_&id'] = current_id;
    submit_record(record);
    return false;
}

//handle create
function create_submit_handler(frm) {
    Common.dbg("before proc form");
    Forms.process_form(frm);
    Common.dbg("before can_record");
    var record = Forms.get_can_record();
    Common.dbg("submit: " + Common.stringify_obj(record));
    submit_record(record);
    return false;
}

//validate, save and flush record
function submit_record(record) {
    //do record validation
    if(!Domain.validate_record(record)) {
        alert("The form is incompletely or incorrectly filled out.\n" +
              "error: " + Domain.validation_error + "\n" +
              "Please correct the error and try again.\n");
        return false;
    }
    Controller.local_persist(record);
    Controller.flush();
}

function update_entity_edit_list() {

    //WARNING:  We access Forms.scope_records directly here...this should
    //          be encapsulated better.

    //if there are parent ents and we don't know parent-rel values yet, don't display anything
    if(!Domain.scope_has_parent_values(current_entity, Forms.scope_records)) {
        output_section_div.innerHTML = "";
        return;
    }

    var query = '_entity=' + current_entity + ',_dirty=0';

    //add filter by current form scope
    //current_entity is scope
    var filter_str = Domain.get_scope_filter(current_entity, Forms.scope_records);
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
        if(id == current_id) {
            cls = "selected_record";
        }
        var ent_view = Domain.entity_view(record);

        //when selected, need to update both the entity_edit_list & the entity_edit 'windows'
        var update_entity_funcall = "update_entity_select_id_helper(this);";
        var edit_div = "<div _&id='" + id + "' _entity='" + current_entity + "' class=" + cls + " onmousedown='" + update_entity_funcall + "'>";
        edit_div += ent_view + "</div>";
        str_array.push(edit_div);
    }

    var friendly_filters = Domain.scope_get_friendly_parent_filters(current_entity, Forms.scope_records);
    var entity_prefix = "Select " + current_entity + " to edit ";
    if(friendly_filters.length > 0) {
        entity_prefix = entity_prefix + "(filtered by " + friendly_filters.join(", ") + ")";
    }
    var prefix = "<h2>" + entity_prefix + " </h2>";
    output_section_div.innerHTML = prefix + str_array.join(" ");
}

//called upon receiving updates from server
function handle_remote_update() {
    update_edit_form_display()
        //update_entity_tee(current_entity, current_id);
}

function load() {

    //setup Controller
    Controller.remote_url = "cgi-bin/data_synk.cgi";
    Controller.init("cgi-bin/data_synk.cgi", document, "msg_section");

    //setup div's
    status_section_div = document.getElementById("status_section");
    entity_section_div = document.getElementById("entity_section");
    input_section_div = document.getElementById("input_section");
    output_section_div = document.getElementById("output_section");

    //set entity list
    var entity_list = create_entity_list_form();
    entity_section_div.innerHTML = "<h2>Select Entity to Edit</h2>" + entity_list;

    //start with User entity
    update_entity_select("User");

    //set the update listener
    Controller.remote_update_handler = handle_remote_update;

    //get all the data from the server
    Controller.remote_sync_query('_entity=**');
}