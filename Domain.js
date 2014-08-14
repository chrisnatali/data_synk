//Survey Domain Model information

var Domain = {};

//Survey domain entity definitions
//Contains validation, referential and display information
Domain.user="_entity=User,-Name=^\\w{1\\,8}$";
Domain.survey="_entity=Survey,-Name=^\\w{1\\,16}$,-&User=Name";
Domain.question="_entity=Question,-Question=^[\\w\\?\\s']{1\\,32}$,-&Survey=Name";
Domain.answer="_entity=Answer,-Answer=^[\\w\\s']{1\\,16}$,-&Question=Question";
Domain.vote="_entity=Vote,-#Answer=:Answer,-&Question=Question,-&User=Name";

Domain.entities = [];
Domain.entities["User"] = Domain.user;
Domain.entities["Survey"] = Domain.survey;
Domain.entities["Question"] = Domain.question;
Domain.entities["Answer"] = Domain.answer;
Domain.entities["Vote"] = Domain.vote;

Domain.validation_error = "";
Domain.ALL_VALUE = -1;

Domain.get_meta_from_entity = function(entity) {
    var dom_rec_str = Domain.entities[entity];
    var dom_rec = Parser.parse_single_record(dom_rec_str, 1);
    var meta_rec = Domain.get_meta_record(dom_rec);
    return meta_rec;
}

Domain.create_scope_record = function(scope_id) {
    var scope_record = [];
    var scope_arr = scope_id.split(/\./);
    var fld = scope_arr.pop();
    var scope = scope_arr.join('.');
    var entity = scope_arr.pop();
    scope_record['_fld'] = fld;
    scope_record['_scope_id'] = scope_id;
    scope_record['_scope'] = scope;
    scope_record['_entity'] = entity;
    return scope_record;
}

Domain.get_scope_record_is_related = function(scope_record) {
    var entity = scope_record['_entity'];
    var meta_rec = Domain.get_meta_from_entity(entity);
    var field = scope_record['_fld'];
    if(meta_rec['related'][field] != undefined) {
        return 1;
    }
    else {
        return 0;
    }
}

Domain.get_scope_record_is_pseudo_related = function(scope_record) {
    var entity = scope_record['_entity'];
    var meta_rec = Domain.get_meta_from_entity(entity);
    var field = scope_record['_fld'];
    if(meta_rec['pseudo_rel'][field] != undefined) {
        return 1;
    }
    else {
        return 0;
    }
}

Domain.get_scope_record_value = function(scope_record) {
    var field = scope_record['_fld'];
    return scope_record[field];
}

Domain.get_scope_record_field_name = function(scope_record) {
    var scope_id = scope_record['_scope_id'];
    var scope_arr = scope_id.split(/\./);
    var last_field = scope_arr.pop();
    var res;
    if(res = last_field.match(/^&(\w{1,})/)) {
        last_field = res[1];
    }
    scope_arr.push(last_field);
    return scope_arr.join('.');
}

Domain.scope_has_parent_values = function(scope, scope_records) {
    var scope_arr = scope.split(/\./);
    var entity = scope_arr.pop();
    var meta_rec = Domain.get_meta_from_entity(entity);
    var filter = [];
    for(var fld in meta_rec['related']) {
        var scope_lookup = scope + '.' + fld;
        var scope_rec = scope_records[scope_lookup];
        if(scope_rec != undefined) {
            var id = scope_rec[fld];
            if(id == undefined) {
                return 0;
            }
        }
        else {
            return 0;
        }
    }
    //if we're here, we found all parent scopes/values
    return 1;
}

Domain.get_scope_filter = function(scope, scope_records) {
    var scope_arr = scope.split(/\./);
    var entity = scope_arr.pop();
    var meta_rec = Domain.get_meta_from_entity(entity);
    var filter = [];
    for(var fld in meta_rec['related']) {
        var scope_lookup = scope + '.' + fld;
        var scope_rec = scope_records[scope_lookup];
        if(scope_rec != undefined) {
            var id = scope_rec[fld];
            if(id != undefined && id != Domain.ALL_VALUE) {
                filter.push(fld + '=' + id);
            }
        }
    }
    if(filter.length > 0) {
        return filter.join(',');
    }
    else { return ""; }
}

//create the scope records representing this entity
Domain.scope_values_from_can_record = function(record, scope) {

    var scope_values = [];

    var scope_ids = Domain.get_ordered_fields(record);

    for(var i in scope_ids) {
        var scope_id = scope_ids[i];
        var value = Domain.get_scope_value(scope_id, record);
        var global_scope_id = scope_id;
        if(scope != undefined && scope != "") {
            global_scope_id = scope + '.' + scope_id;
        }
        scope_values[global_scope_id] = value;
    }

    //handle case where the record is actually referred to by
    //entity at top of scope
    if((scope != undefined) && (scope != "") && (record['_&id'] != undefined)) {

        var scope_arr = scope.split(/\./);
        var top_entity = scope_arr.pop();
        var rel_field_name = '&' + record['_entity'];
        var meta_rec = Domain.get_meta_from_entity(top_entity);
        if(meta_rec['related'][rel_field_name] != undefined) {
            //add to scope values
            scope_values[scope + '.' + rel_field_name] = record['_&id'];
        }
    }

    return scope_values;
}

//get value from a scope field and a base record
//Consider moving this into Controller or DataMgr if useful
Domain.get_scope_value = function(scope_field, base_record) {
    scope_fields = scope_field.split(/\./);

    //ensure that scope_field base and base_record match
    var base_entity = scope_fields[0];
    var entity = base_record['_entity'];
    if(base_entity != entity) {
        throw new Error("base_record and scope_field do not match.");
    }

    if(scope_fields.length == 2) {
        //base case, just return the base_record field
        field = scope_fields[1];
        value = base_record[field];
        return value;
    }

    //recursively climb tree till we get a value
    scope_fields.shift();
    var par_entity = scope_fields[0];
    var ref_fld = '&' + par_entity;
    var id = base_record[ref_fld];
    if(id == undefined) {
        return;  //return nothing because the parent is not set
    }
    return Domain.get_scope_value(scope_fields.join('.'), Controller.get_record(id));
}

Domain.in_scope = function(current_scope, scope) {

    //if current_scope empty, in_scope is 0 UNLESS the scope is also empty
    if(current_scope == undefined || current_scope == "") {
        return 0;
    }

    if((current_scope != scope) && (current_scope.search(scope) == 0)) {
        return 1;
    }
    else {
        return 0;
    }
}

Domain._is_scope_ref = function(scope) {
    var scope_arr = scope.split(/\./);
    var last_field = scope_arr.pop();
    var res = last_field.match(/^&\w{1,}/);
    if(res) {
        return 1;
    }
    else {
        return 0;
    }
}

//traverse up the meta-data graph building an ordered array of
//entity.fields from the relationship information
Domain.get_ordered_fields = function(form_record) {
    var record_field_hash = [];
    var visited = []; //ensures no cycles

    Domain._ordered_fields_helper(form_record, record_field_hash, 0, visited);
    //sort the hash by height and return array in hi-lo order
    var idx_ents = Common.create_index(record_field_hash);
    depth_scope_sorter = function(a, b) {
        var value = (b['val'] - a['val']);
        if(value != 0) {
            return value;
        }
        else {
            akey = a['key'];
            bkey = b['key'];
            var a_ref = Domain._is_scope_ref(akey);
            var b_ref = Domain._is_scope_ref(bkey);
            value = (b_ref - a_ref);
            if( value != 0) {
                return value;
            }
            else { //sort alpha
                if(bkey > akey) {
                    return -1;
                }
                else {
                    return 1;
                }
            }
        }
    }

    idx_ents.sort( depth_scope_sorter );
    return Common.create_array(idx_ents);
}

//helper that does recursive work and ensures no duplication/cycles
//use 'height' here as this assumes the current record is 'low' and we're looking at
//it's parents as we go recurse 'higher'
//record_field_hash is populated with fld=record_field, val=height
Domain._ordered_fields_helper = function(form_record, record_field_hash, height, visited) {

    var meta_record = Domain.get_meta_record(form_record);

    //add this records fields last
    var entity = meta_record['_entity'];

    //search for the entity in the stack, if there, we have a cycle
    for(var i in visited) {
        if(entity == visited[i]) {
            throw new Error("found cycle.  visited: " + Common.stringify_obj(visited));
        }
    }

    visited.push(entity);
    var scope = visited.join('.');


    for(var fld in meta_record['fields']) {
        if(height != 0 && (!meta_record['related'][fld])) {
            continue; // skip non-related fields at anything other than the 'base' entity
        }
        var rec_fld = scope + '.' + fld;
        record_field_hash[rec_fld] = height;
    }


    //add related fields recursively 1st (then we'll push this entities records on after)
    var rel_entities = Domain._get_related_entities(meta_record);
    for(var ent in rel_entities) {
        //get the entity form record
        var rel_form_record_str = Domain.entities[ent];
        if(rel_form_record_str == undefined) {
            throw new Error("related entity: " + ent + " not found.");
        }
        var rel_form_record = Parser.parse_single_record(rel_form_record_str, 1);
        Domain._ordered_fields_helper(rel_form_record, record_field_hash, height+1, visited);
    }
    visited.pop();
}

Domain._get_related_entities = function(meta_record) {
    var entities = [];
    //add related fields recursively 1st (then we'll push this entities records on after)
    for(var rel_fld in meta_record['related']) {
        //get the entity name
        var res = rel_fld.match(/^&(\w{1,})/);
        var ent = res[1];
        entities[ent] = 1;
    }

    //add pseudo-related fields recursively 2nd (then we'll push this entities records on after)
    for(var pseudo_rel_fld in meta_record['pseudo_rel']) {
        //pseudo_rel_fld is just the entity name
        entities[pseudo_rel_fld] = 1;
    }

    return entities;
}

//returns a friendly view string of an entity basedon domain def above
Domain.entity_view = function(record) {

    //ensure that we know the entity
    if(!record['_entity']) {
        throw new Error("records need to have an _entity field.");
    }

    var entity = record['_entity'];

    //lookup form_record, get domain_record
    if(!this.entities[entity]) {
        throw new Error("entity not found in domain.");
    }

    var form_record = this.entities[entity];
    var domain_record = Parser.parse_single_record(form_record, 1);
    var meta_record = this.get_meta_record(domain_record);
    var str_array = [];

    for(var fld in meta_record['fields']) {

        if(record[fld] == undefined) {
            throw new Error("Field is undefined in record: " + fld);
        }

        var val = record[fld];

        var res;

        if(res = fld.match(/^&(\w{1,})/)) { //related field
            var result = Domain._get_related_name_val(meta_record, fld, val);
            if(result != "") {
                str_array.push(result);
            }
        }
        else { //it's just a text field
            var fld_val_str = fld + ": " + val;
            str_array.push(fld_val_str);
        }
    }
    return str_array.join(", ");
}

//assumes ref_field is 'related' (i.e prefixed by '&')
Domain._get_related_name_val = function(ref_meta_rec, ref_field, id) {

    var ref_fld_name;
    res = ref_field.match(/^&(\w{1,})/);
    var ref_entity = res[1];
    var meta_val = ref_meta_rec['fields'][ref_field];
    if(res = meta_val.match(/^\:{0,1}(.*)/)) {
        ref_fld_name = res[1];
        var result = this._lookup_field(ref_entity, id, ref_fld_name);
    }
    else {
        throw new Error("Invalid domain record format, val: " + val);
    }
    return result;
}

//return an array of 'friendly' parent filters
Domain.scope_get_friendly_parent_filters = function(scope, scope_records) {
    var scope_arr = scope.split(/\./);
    var entity = scope_arr.pop();
    var meta_rec = Domain.get_meta_from_entity(entity);
    var filters = [];
    var result = "";
    for(var fld in meta_rec['related']) {
        var scope_lookup = scope + '.' + fld;
        var scope_rec = scope_records[scope_lookup];
        if(scope_rec != undefined) {
            var id = scope_rec[fld];
            if(id == undefined) {
                continue;
            }
            filters.push(Domain._get_related_name_val(meta_rec, fld, id));
        }
    }
    return filters;
}

//build semantic meta_record for domain_record
Domain.get_meta_record = function(domain_record) {

    var meta_record = [];
    meta_record['_entity'];
    meta_record['fields'] = [];  //canonical field names...value is either a pattern or other entity field-name
    meta_record['unique'] = [];  //unique fields
    meta_record['related'] = [];  //fields maintaining a rel to other entity-records
    meta_record['pseudo_rel'] = []; //fields 'derived' from, but no enforced rel to other ents

    for(var fld in domain_record) {
        var res;
        var value = domain_record[fld];

        if(fld == '_entity') {
            meta_record['_entity'] = value;
            continue;
        }

        //unique is only qualifier that can be applied to all other field types
        if(res = fld.match(/^-(.{1,})/)) {
            fld = res[1];
            //pseudo_rel fields can be part of unique key so, we need to handle this
            if(res = fld.match(/^#(\w{1,})/)) {
                meta_record['unique'][res[1]] = 1;
            }
            else {
                meta_record['unique'][fld] = 1;
            }
        }


        if(res = fld.match(/^#(\w{1,})/)) { //pseudo-related field
            fld = res[1];
            meta_record['pseudo_rel'][fld] = 1;
        }
        else if(res = fld.match(/^(&\w{1,})/)) { //related field
            meta_record['related'][fld] = 1;
        }
        else if(res = fld.match(/^(\w{1,})/)) { //plain text field
            //do nothing, just a sanity check
        }
        else { //invalid
            throw new Error("Invalid field definition.  fld: " + fld);
        }

        //add fld,val
        meta_record['fields'][fld] = value;
    }

    if(meta_record['_entity'] == undefined) {
        throw new Error("Invalid domain_record.  No _entity field defined.");
    }
    return meta_record;
}

//look up entity/remote_id in another record and return entity.fld val string
Domain._lookup_field = function(entity, remote_id, fld_name) {
    var fld_val_str = "";
    var query = '_entity=' + entity + ',_&id=' + remote_id;
    var records = Controller.local_query(query);
    if(records[0] != undefined) {
        var rec = records[0];
        if(rec[fld_name] != undefined) {
            fld_val_str = entity + "." + fld_name + ": " + rec[fld_name];
        }
    }
    return fld_val_str;
}

//true if field is valid, else false
Domain.validate_field = function(entity, field, value) {
    var domain_packed = Domain.entities[entity];
    if(!domain_packed) {
        throw new Error("entity type not found in Domain.");
    }
    var domain_record = Parser.parse_single_record(domain_packed, 1);
    var meta_record = Domain.get_meta_record(domain_record);

    if(!Domain._validate_field_helper(field, value, meta_record)) {
        return false;
    }
    return true;
}

//validate entire record (true if valid, else invalid)
//assumes that if record is being updated, it has an _&id, else it doesn't
//this is important for dup detection
Domain.validate_record = function(record) {
    var entity = record['_entity'];
    var domain_packed = Domain.entities[entity];
    if(!domain_packed) {
        throw new Error("entity type not found in Domain.");
    }
    var domain_record = Parser.parse_single_record(domain_packed, 1);
    var meta_record = Domain.get_meta_record(domain_record);

    //1st pass, validate all text fields by their pattern
    for(var field in meta_record['fields']) {

        var value = record[field];
        if(!Domain._validate_field_helper(field, value, meta_record)) {
            return false;
        }

    }

    //2nd pass, validate all related fields
    //assumes they all need to hold valid ref's
    for(var field in meta_record['related']) {

        var value = record[field];
        if(!Domain._validate_field_helper(field, value, meta_record)) {
            return false;
        }

    }

    //if we made it here, we need to check unique constraints
    //currently, all fields designated as unique make up the unique 'key'
    var str_q_array = [];
    str_q_array.push("_entity=" + meta_record['_entity']);
    for(var unq_fld in meta_record['unique']) {
        var unq_val = record[unq_fld];
        str_q_array.push(unq_fld + "=" + unq_val);
    }

    if(str_q_array.length > 1) { //i.e. a record other than _entity is defined
        var query = str_q_array.join(",");
        var records = Controller.local_query(query);
        if(records.length > 0) {
            //if there's only one record, it may be that we're updating
            //this record...in which case, this is OK
            var is_new = (record['_&id'] == undefined);
            if(records.length > 1 || (is_new || (records[0]['_&id'] != record['_&id']))) {
                Domain.validation_error = "Uniqueness constraint error.";
                return false;
            }
        }
    }


    return true;
}

//do validation work
Domain._validate_field_helper = function(field, value, meta_record) {

    var res;

    if(res = field.match(/^&(\w{1,})/)) { //related field
        var ref_entity = res[1];
        //related fields need to have a value
        if(value == undefined || value == "") {
            Domain.validation_error = "Related field: " + field + " must to have a valid value.";
            return false;
        }
        //query to ensure that the ref'd record exists
        var query = '_entity=' + ref_entity + ',_&id=' + value;
        Common.dbg("rel query: " + query);
        var records = Controller.local_query(query);
        if(!records.length > 0) {
            Domain.validation_error = "Invalid reference: " + field + " value: " + value;
            return false; //no matching records
        }
    }
    else if(meta_record['pseudo_rel'][field]) { //get vals from other entity
        if(value == undefined || value == "") {
            Domain.validation_error = "Related field: " + field + " must to have a valid value.";
            return false;
        }
    }

    else { //only validate plain text fields here
        var pattern = meta_record['fields'][field];
        if (value.search(pattern) == -1) {
            Domain.validation_error = "Invalid field: " + field + " value: " + value;
            return false;
        }
    }
    return true;
}