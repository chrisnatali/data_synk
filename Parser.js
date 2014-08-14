/**
 * Description:
 * Module for parsing formatted strings of data.
 * Specific for use within Data Synk framework.
 * parse_query and parse_records assume that
 * the input string has 'escaped' the chars [,=]
 * with a preceding '\' in any user values.
 *
 * Depends on Common.js for behindSplit function
 */

var Parser = {};

/* parses a string into 3 records based on the 1st 2 \n's
 * encountered.  The 3 records represent:
 * SyncID:  ID used for client/server data sync
 * Query:  The query scope for the sync
 * Records:  The records to be synced
 * returns message hash
 */
Parser.parse_message = function(packed_message) {
    var result;
    var message = [];
    if(result = packed_message.match(/([^\n]*)\n([^\n]*)\n([\s\S]*)/)) {
        message['sync_id'] = result[1];
        message['query'] = result[2];
        message['records'] = result[3];
        return message;
    }
    else {
        throw new Error("Invalid message format.");
    }
}

//reverse of parse_message
Parser.pack_message = function(message) {
    var packed_message = message['sync_id'] + '\n' +
                         message['query'] + '\n' +
                         message['records'];

    return packed_message;
}



/* parses a string into a tuple array of criterion
 * criteria is an array of tuples
 * query : criterion
 * criterion : field=value [',' criterion]
 *
 * uses negative lookbehind to ignore escaped tokens [:,=]
 * returns a reference to the tuple array
 */
Parser.parse_query = function(query_str) {

    var tuples = new Array();

    var criterion = Common.behind_split(query_str, ",", "\\", 1);

    for(var j in criterion) {
        var criteria = criterion[j];
        // split on '=' (ignoring \= shouldn't be needed cuz field isalpha)
        // NOTE:  allow & and . in spots within field
        var result = criteria.match(/^\s*(((_{0,1}&{0,1}[\w]{1,})\.){0,1}_{0,1}&{0,1}[\w]{1,})=(.*)$/);
        var fld = result[1];
        var val = result[4];

        if(! result) {
            throw new Error("Empty field in criteria is not allowed.");
        }

        //convert val to regex if it's wrapped in /'s
        if(result = val.match(/^\/(.*)\/$/)) {
            val = new RegExp(result[1]);
        }
        var tuple = [ fld, val ];
        tuples.push(tuple);
    }
    return tuples;
}

/* parses a string into an array of records
 * record is hash of fields/values
 * record:  field_values '\n'
 * field_values : field=value [',' field_values]
 *
 * uses negative lookbehind to ignore escaped tokens [,=]
 * returns the record array
 */
Parser.parse_records = function(record_str) {
    var record_array = new Array();
    var records = record_str.split(/\n/);
    for(var i in records) {
        var rec = records[i];
        //skip blank lines
        if(!rec) continue;
        var rec_ref = this.parse_single_record(rec);
        record_array.push(rec_ref);
    }
    return record_array;
}

//single record
//if loose is true, do very little validation
Parser.parse_single_record = function(record_str, loose) {
    var fld_vals = Common.behind_split(record_str, ",", "\\", 1);
    var rec_ref = [];
    for(var j in fld_vals) {
        var fld_val = fld_vals[j];
        // split on '=', (ignoring \= shouldn't be needed cuz field isalpha)
        // NOTE:  & allowed
        var results;
        if(loose) {
            results = fld_val.match(/^\s*([^=]*)=(.*)$/);
        }
        else {
            results = fld_val.match(/^\s*(_{0,1}&{0,1}\w{1,})=(.*)$/);
        }
        if(! results) {
            throw new Error("Invalid record format.");
        }
        var fld = results[1];
        var val = results[2];
        if(! fld) {
            throw new Error("Empty field in record is not allowed.");
        }
        if( rec_ref[fld] ) {
            throw new Error("Field " + fld + " already exists in record.");
        }

        // unescape ,= in strings
        if(typeof val == 'string') {
            val = val.replace(/\\([,=])/g, "$1");
        }

        // add field to field array for the entity
        rec_ref[fld] = val;
    }
    return rec_ref;
}

// reverse of parse_records
// takes an array of records
Parser.pack_records = function(record_array) {
    var record_str_array = [];
    for(var i in record_array) {
        var rec = Common.clone_obj(record_array[i]); //don't modify it
        //get a sorted idx of the record so that all records of same
        //type 'look' the same

        var idx_rec = this._sort_record(rec);
        var fld_val_join = [];
        for(var i in idx_rec) {
            var fld = idx_rec[i]['key'];
            var val = idx_rec[i]['val'];
            // escape ,=
            if(typeof val == 'string') {
                val = val.replace(/([,=])/g, "\\$1");
            }
            fld_val_join.push(fld + "=" + val);
        }
        var fld_val_str = fld_val_join.join(",");
        record_str_array.push(fld_val_str);
    }
    return record_str_array.join("\n");
}

//sort record in viewing friendly way
//i.e. _entity 1st, _id 2nd, _&id 3rd, then the rest by alpha
Parser._sort_record = function(assoc_arr) {
    var idx = Common.create_index(assoc_arr);
    idx.sort(function(a, b) {
            return(Parser._sort_record_fun(a['key'], b['key']));
        });
    return idx;
}

Parser._sort_record_fun = function(akey, bkey) {
    var fld_idx = [];
    fld_idx['_entity'] = 1;
    fld_idx['_id'] = 2;
    fld_idx['_&id'] = 3;
    if(fld_idx[akey] && fld_idx[bkey]) {
        return fld_idx[akey] - fld_idx[bkey];
    }
    else if(fld_idx[akey]) {
        return -1;
    }
    else if(fld_idx[bkey]) {
        return 1;
    }
    else if(akey > bkey) {
        return 1;
    }
    else {
        return -1;
    }
}
