//Module for creating/processing forms on JavaScript side of DataSynk framework

var Forms = {};

//This hash defines buttons to be set on a form
Forms.html_submit_buttons = [];
Forms.select_onchange_fun_str;

Forms.form_meta_record = []
Forms.form_record = [];
Forms.scope_idx = [];

Forms.scope_records = [];
Forms.scope_invisible = [];  //do not display any form elements whose scopes are set here
Forms.scope_id_prefix = []; //text to be displayed prior to diplaying a particular scope (in <table> context)
Forms.scope_id_field_name = []; //override default field name associated with scope field
Forms.scope_allow_all = []; //determines whether a scope id (of a rel'd field) has an 'all' option

//initialize the form
Forms.init = function(form_record_str, submit_buttons, select_onchange_fun_str) {
    Forms.form_record = Parser.parse_single_record(form_record_str, 1);
    Forms.form_meta_record = Domain.get_meta_record(Forms.form_record);
    Forms.scope_idx = Domain.get_ordered_fields(Forms.form_record);
    Forms.scope_records = [];
    Forms.scope_prune = [];
    Forms.html_submit_buttons = [];
    Forms.select_onchange_fun_str = undefined;
    for(var i in Forms.scope_idx) {
        var scope_id = Forms.scope_idx[i];
        var scope_record = Domain.create_scope_record(scope_id);
        Forms.scope_records[scope_id] = scope_record;
    }

    if(submit_buttons != undefined) {
        Forms.html_submit_buttons = submit_buttons;
    }
    if(select_onchange_fun_str != undefined) {
        Forms.select_onchange_fun_str = select_onchange_fun_str;
    }
}

Forms.get_scope_id_value = function(scope_id) {
    var value;
    value = Domain.get_scope_record_value(Forms.scope_records[scope_id]);
    return value;
}

//this sets the Form scope from a canonical record & scope
//assuming Form has been init'd
Forms.set_scope_can_record = function(record, scope) {
    var scope_values = Domain.scope_values_from_can_record(record, scope);

    //iterate through current scopes, setting values where found
    for(var i in Forms.scope_records) {
        var scope_record = Forms.scope_records[i];
        var scope_this = scope_record['_scope'];
        var scope_id = scope_record['_scope_id'];
        var value = scope_values[scope_id];
         var field = scope_record['_fld'];
        if(value != undefined) {
            scope_record[field] = value;
        }
        else {
            //clear any existing values if in scope
            if(!Domain.in_scope(scope, scope_this)) {
                continue; //should NOT be affected since change is outside scope
            }
            scope_record[field] = undefined;
        }
    }
}

//get the canonical value based on the 'base entity' from the scope_records/form
Forms.get_can_record = function() {
    var can_record = [];
    var entity = Forms.form_meta_record['_entity'];
    can_record['_entity'] = entity;
    for(var id in Forms.scope_records) {
        var scope_record = Forms.scope_records[id];
        if(scope_record['_scope'] == entity) {
            var fld = scope_record['_fld'];
            var val = scope_record[fld];
            can_record[fld] = val;
        }
    }
    return can_record;
}

Forms._element_typecheck = function(element) {
    var e_typ = element.type;
    Common.dbg("type: " + e_typ);
    return (e_typ == 'text' || e_typ == 'hidden' || e_typ == 'select-one' || e_typ == 'radio');
}

//Processes 'canonical' forms...set scope_record values
Forms.process_form = function(form) {
    for(var i = 0; i < form.elements.length; i++) {
        Forms.process_element(form.elements[i]);
    }
}

Forms.process_element = function(element) {
    if(!Forms._element_typecheck(element)) {
        return;
    }
    var scope_id = element.getAttribute('name');
        Common.dbg("scope_id: " + scope_id);
    var scope_record = Forms.scope_records[scope_id];
    var fld = scope_record['_fld'];
    if(element.type == 'text' || element.type == 'hidden') {
        scope_record[fld] = element.value;
    }
    else if(element.type == 'select-one') {

        var index = element.selectedIndex;
        var value;
        if(index == -1) {
            value = undefined;
        }
        else {
            value= element.options[index].value;
        }
        scope_record[fld] = value;
    }
    else if(element.type == 'radio') {
        if(element.checked) {
            scope_record[fld] = element.value;
        }
    }
    return scope_record;

}


Forms.process_change = function(element) {
    var scope_record = Forms.process_element(element);
    if(scope_record != undefined) {
        //check if the value is 'related'
        //if so, get the can record and set the scope to clear out rest of form
        var meta_rec = Domain.get_meta_from_entity(scope_record['_entity']);
        var field = scope_record['_fld'];
        if(meta_rec['related'][field]) {
            //get the id, record and set current scope
            var id = scope_record[field];
            if(id == Domain.ALL_VALUE) {
                //don't unset any values...this will be handled upon pop'ing form
                return scope_record;
            }
            var record = Controller.get_record(id);
            var scope = scope_record['_scope'];
            Forms.set_scope_can_record(record, scope);
        }
    }
    return scope_record;
}

//assumes the scope_record is of a 'related' nature
Forms._create_rel_helper = function(scope_record, meta_record) {

    //now lookup any parent entity rel_field/vals
    var fld = scope_record['_fld'];
    var par_ent = fld;
    var res;
    var related = 0;
    var form_str = "";

    if(res = fld.match(/^&(\w{1,})/)) {
        par_ent = res[1];
        related = 1;
    }

    var par_scope = scope_record['_scope'] + '.' + par_ent;

    if(!Domain.scope_has_parent_values(par_scope, Forms.scope_records)) {
        //don't display anything
        return form_str;
    }

    var filter_str = "";
    filter_str = Domain.get_scope_filter(par_scope, Forms.scope_records);

    var field_name = meta_record['fields'][fld];
    var radio = 0;
    if(res = field_name.match(/^\:(.*)/)) {
        field_name = res[1];
        radio = 1;
    }

    var existing_val;
    if(scope_record[fld] != undefined) {
        existing_val = scope_record[fld];
        //skipt this check if it's ALL
        if(existing_val != Domain.ALL_VALUE) {
            var parent_fld = '_&id';
            //check if existing_val even exists in parent entity recset
            if(!related) {
                parent_fld = field_name;
            }
            var query = '_entity=' + par_ent + ',_dirty=0' + ',' + parent_fld + '=' + existing_val;
            var recs = Controller.local_query(query);
            if(recs.length == 0) {
                existing_val = undefined;
            }
        }
    }


    //filter should now be set so get records and select one if not already
    //get only 'clean' records
    var query = '_entity=' + par_ent + ',_dirty=0';
    if(filter_str != undefined && filter_str != "") {
        query = query + ',' + filter_str;
    }
    var results = Controller.local_query(query);


    //sort results by field_name
    results.sort(function(a, b) {
            if(a[field_name] > b[field_name]) {
                return 1;
            }
            else { return -1; }
        });

    if(existing_val == undefined) {
        if(results.length > 0) {
            //Warning...modifying scope_record to set value
            if(related) {
                existing_val = results[0]['_&id'];
            }
            else {
                existing_val = results[0][field_name];
            }
            scope_record[fld] = existing_val;
        }
    }

    if(radio) {
        form_str = Forms._create_radio(scope_record, field_name, results);
    }
    else {
        form_str = Forms._create_select(scope_record, field_name, results);
    }
    return form_str;
}


Forms._create_form_helper = function(scope_record) {

    var entity = scope_record['_entity'];
    var meta_record = Domain.get_meta_from_entity(entity);

    //handle related scope records
    var fld = scope_record['_fld'];
    var scope_id = scope_record['_scope_id'];
    var str_array = [];
    str_array.push("<tr>");
    var fld_str = "";
    if(meta_record['related'][fld] || meta_record['pseudo_rel'][fld]) {
        fld_str = Forms._create_rel_helper(scope_record, meta_record);
    }
    else { //it's just a text field
        var existing_val = scope_record[fld];
        var fld_name = fld;
        //check if we've overridden field name
        if(Forms.scope_id_field_name[scope_id]) {
            fld_name = Forms.scope_id_field_name[scope_id];
        }
        if(existing_val != undefined) {
            fld_str = "<td>" + fld_name + "</td><td><input type='text' name='" + scope_id + "' entity='" + entity + "' value='" + existing_val + "' onchange='Forms.validate_textfield(this);'/></td>";
        }
        else {
            fld_str = "<td>" + fld_name + "</td><td><input type='text' name='" + scope_id + "' entity='" + entity + "' onchange='Forms.validate_textfield(this);'/></td>";
        }
    }

    str_array.push(fld_str);
    //add end tr
    str_array.push("</tr>");
    return str_array.join("\n");
}

//Assumes Form has been init'd
Forms.create_form = function() {

    var entity = Forms.form_meta_record['_entity'];
    var str_array = [];

    str_array.push("<form name='" + entity + "'>");

    //wrap all field/value selections in a table for formatting
    str_array.push("<table>");

    for(var i in Forms.scope_idx) {

        //TODO:  Prune scoped fields based on prune scopes
        var scope_id = Forms.scope_idx[i];

        Common.dbg('scope_id: ' + scope_id);
        //Prune out invisible scope fields
        if(Forms.scope_invisible[scope_id]) {
            continue;
        }
        if(Forms.scope_id_prefix[scope_id]) {
            str_array.push(Forms.scope_id_prefix[scope_id]);
        }
        var scope_rec = Forms.scope_records[scope_id];
        var frm_str = Forms._create_form_helper(scope_rec);
        str_array.push(frm_str);

    }
    str_array.push("</table>");

    //add any buttons
    for(var button in Forms.html_submit_buttons) {
        str_array.push(Forms.html_submit_buttons[button]);
    }

    str_array.push("</form>");
    return str_array.join("\n");
}

//create select field
Forms._create_select = function(scope_record, field_name, results) {
    var str_array = [];

    var scope_id = scope_record['_scope_id'];
    var existing_val = Domain.get_scope_record_value(scope_record);
    var related = Domain.get_scope_record_is_related(scope_record);
    var scope_field_name = Domain.get_scope_record_field_name(scope_record);
    var onchange = "";
    if(Forms.select_onchange_fun_str != undefined) {
        onchange = " onchange='" + Forms.select_onchange_fun_str + ";'";
    }

    var fld_name = scope_field_name;
    //check if we've overridden field name
    if(Forms.scope_id_field_name[scope_id]) {
        fld_name = Forms.scope_id_field_name[scope_id];
    }
    str_array.push("<td>" + fld_name + "</td><td><select name='" + scope_id + "' " + onchange + ">");

    if(Forms.scope_allow_all[scope_id] != undefined) {
        var label = Forms.scope_allow_all[scope_id];
        var sel = (existing_val == undefined ? "selected" : "");
        str_array.push("<option value='" + Domain.ALL_VALUE + "' " + sel + ">" + label + "</option>");
    }
    for(var i in results) {
        //ensure that the record has field_name field
        var record = results[i];
        if(record[field_name] == undefined) {
            throw new Error("record does not have field: " + field_name);
        }
        //if we don't have _&id field ignore the record as it hasn't been persisted
        if(record['_&id'] == undefined) {
            continue;
        }

        var value;
        if(related) { //make value the id
            value = record['_&id'];
        }
        else {
            value = record[field_name];
        }

        var label = record[field_name];
        var sel = "";

        //NOTE:  potential no selection if existing_val doesn't match anything
        if(value == existing_val) {
            sel = "selected";
            selected = 0;
        }

        //create option string
        str_array.push("<option value='" + value + "' " + sel + ">" + label + "</option>");
    }
    //end the select
    str_array.push("</select></td>");
    return str_array.join("\n");
}

//create radio field based on related entity values
Forms._create_radio = function(scope_record, field_name, results) {
    var str_array = [];
    var scope_id = scope_record['_scope_id'];
    var existing_val = Domain.get_scope_record_value(scope_record);
    var related = Domain.get_scope_record_is_related(scope_record);
    var name = scope_id;

    var onchange = "";
    if(Forms.select_onchange_fun_str != undefined) {
        onchange = " onchange='" + Forms.select_onchange_fun_str + ";'";
    }

    str_array.push("<td>"); //start new cell, each with it's own rows
    for(var i in results) {
        var record = results[i];
        //ensure that the record has field_name field
        if(record[field_name] == undefined) {
            throw new Error("record does not have field: " + field_name);
        }
        //if we don't have _&id field ignore the record as it hasn't been persisted
        if(record['_&id'] == undefined) {
            continue;
        }

        var value;
        if(related) { //make value the id
            value = record['_&id'];
        }
        else {
            value = record[field_name];
        }

        var label = record[field_name];
        var sel = "";

        //NOTE:  potential no selection if existing_val doesn't match anything
        if(value == existing_val) {
            sel = "checked";
        }

        //create option string
        str_array.push("<tr><td><input type='radio' name='" + name + "' value='" + value + "' " + sel + " " + onchange + ">" + label + "</input></td></tr>");
    }
    str_array.push("</td>"); //end cell
    return str_array.join("\n");
}

//validates all text fields in a form
Forms.validate_text_fields = function(frm) {

    // Now loop through the elements in our form
    for(j = 0; j < frm.elements.length; j++) {
        var e = frm.elements[j];  // the element we're working on

        // We're only interested in <input type="text"> fields
        if(e.type == "text") {
            Forms.validate_textfield(e);
        }
    }
}

//takes a textfield to validate
//sets textfield class to invalid if invalid...this class should have an appropriate style def
Forms.validate_textfield = function(textfield) {

    var scope_id = textfield.getAttribute("name"); // the field name
    var scope_rec = Forms.scope_records[scope_id];
    var value = textfield.value;                    // the user's input
    var entity = scope_rec['_entity'];
    var field = scope_rec['_fld'];

    //set textfield class to invalid if invalid
    if(!Domain.validate_field(entity, field, value)) {
        textfield.className = "invalid";
    }
    else {
        textfield.className = "valid";
    }
}