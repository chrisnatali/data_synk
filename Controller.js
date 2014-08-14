//Controller for JavaScript side of DataSynk framework
//NOTE:  This is truly a singleton...all 'this' references
//have been changed to the single 'Controller'.

var Controller = {};

Controller.remote_url = "";

//this is 'on' while an update request is being processed
//we cannot allow updates while locked
Controller._locked = 0;

//div to write messages to
Controller._msg_div;

//Timer/message related
Controller.timer_obj;
Controller.timer_interval = 3000;
Controller.timer_on = 0;

//handler to be notified upon receiving updated data
Controller.remote_update_handler = 0;

//keep the sync_id in the controller on clientside...no need to push this into DataMgr here
Controller.sync_id = 0;

//keep the last query string requested as the 'query context'
Controller.query_context = "";

//helper for functions requiring lock check
Controller._check_lock = function() {
    if(Controller._locked) {
        Controller.warning_msg("Waiting for server...");
        throw new Error("Cannot update records while waiting for flush response.");
    }
}

/*
 * To be called once page has been loaded
 * init controller
 * remote_url : the url to sync data with
 * document : the document element (optional)
 * div_id : name of div within doc to use for msg's/debugging (optional)
 */
Controller.init = function(remote_url, document, div_id) {
    //just update heap with no records
    DataMgr.update_heap(null, 1);
    if(!remote_url) {
        throw new Error("remote_url cannot be empty");
    }
    Controller.remote_url = remote_url;

    if(document != undefined) {
        document.onkeypress = Controller.handle_key_press;
        Controller._msg_div = document.getElementById(div_id);
        if(Controller._msg_div == undefined) {
            throw new Error("div by id: " + div_id + " cannot be found.");
        }
    }
    Common.debug_handler = Controller.update_msg;
}

//handle an a non-sync query request response from the server
//simply invokes the remote_update_handler with the records
Controller.handle_query_response = function(packed_message) {
    var records = [];
    if(packed_message) {
        var message = Parser.parse_message(packed_message);
        //ignore new sync_id
        Controller.sync_id = message['sync_id'];

        //parse records and update
        records = Parser.parse_records(message['records']);
    }

    if(typeof Controller.remote_update_handler == 'function') {
        //pass the records to the handler
        Controller.remote_update_handler(records);
    }
}

//handle a query request response from the server
//remote sync queries clear out all local data
Controller.handle_sync_query_response = function(packed_message) {
    //update all the data in the 'heap'
    //ignore if there's no data
    if(packed_message) {
        var message = Parser.parse_message(packed_message);
        //set new sync_id
        Controller.sync_id = message['sync_id'];
        //todo: may want to verify the query we sent...
        //ignore for now --> message['query'];

        //parse records and update
        var records = Parser.parse_records(message['records']);
        Common.dbg("before update.  packed: " + packed_message);
        DataMgr.update_heap(records, 1); //clear out heap, then update
        Common.dbg("after update");
    }

    if(typeof Controller.remote_update_handler == 'function') {
        Common.dbg("invoking remote_update_handler");
        Controller.remote_update_handler();
    }
}

//handle an update request response
Controller.handle_update_response = function(packed_message) {

    Common.dbg("Received response: " + packed_message);
    if(packed_message) {
        var message = Parser.parse_message(packed_message);
        //set new sync_id
        Controller.sync_id = message['sync_id'];
        //todo: may want to verify the query we sent...
        //ignore for now --> message['query'];

        //parse records and update
        var records = Parser.parse_records(message['records']);
        Common.dbg("before update.  packed: " + packed_message);
        DataMgr.update_heap(records); //only update...don't clear them all out
        Common.dbg("after update");
    }
    else {
        Controller.warning_msg("There was a problem submitting your data.  Please try again.");
    }
    //clear the old dirty records
    DataMgr.clear_dirty_records();
    //unlock the Controller as we shouldn't have any more '_dirty' records
    Controller._locked = 0;
    if(typeof Controller.remote_update_handler == 'function') {
        Common.dbg("invoking remote_update_handler");
        Controller.remote_update_handler();
    }
}

//perform a 'local' query
Controller.local_query = function(query_str) {
    var query_tuples = Parser.parse_query(query_str);
    var result = DataMgr.query(query_tuples);
    return result;
}

//get a record by id
Controller.get_record = function(id) {
    return DataMgr.get_record(id);
}

//perform a 'local' query
Controller.local_query_str = function(query_str) {
    Common.dbg("executing query: " + query_str);
    var records = Controller.local_query(query_str);
    //sort the records fields in alpha order
    var result = Parser.pack_records(records);
    return result;
}

//update local data
Controller.local_persist_all = function(records) {
    Controller._check_lock();
    DataMgr.persist_all(records);
}

//update local data
Controller.local_persist = function(record) {
    Controller._check_lock();
    DataMgr.persist(record);
}

//update local data
Controller.local_persist_str = function(record_str) {
    Controller._check_lock();
    var records = Parser.parse_records(record_str);
    //note that parse_records returns an array of records
    //so we need to persist_all
    DataMgr.persist_all(records);
}

//perform a remote query to sync DataMgr
Controller.remote_sync_query = function(query_str) {
    var values = [];
    Controller.query_context = query_str;
    //set sync_id to 0 as we want new data
    values['msg'] = "0\n" + query_str + "\n";
    Common.dbg("sending query request.  url: " + Controller.remote_url + " " + Common.stringify_obj(values));
    HTTP.post(Controller.remote_url, values, Controller.handle_sync_query_response);
}

//perform a remote query
Controller.remote_query = function(query_str) {
    var values = [];
    Controller.query_context = query_str;
    //set sync_id to 0 as we want new data
    values['msg'] = "0\n" + query_str + "\n";
    Common.dbg("sending query request.  url: " + Controller.remote_url + " " + Common.stringify_obj(values));
    HTTP.post(Controller.remote_url, values, Controller.handle_query_response);
}

//flush all the dirty data to the remote location
//can override current query_context by passing in the optional query_str
Controller.flush = function(query_str) {
    //lock till we get a response
    Controller._check_lock();
    Controller._locked = 1;
    var values = [];
    var records = DataMgr.get_dirty_records();
    var record_str = Parser.pack_records(records);

    //see if we have query arg...if not use the query_context
    if(query_str == undefined) {
        query_str = Controller.query_context;
    }
    values['msg'] = Controller.sync_id + "\n" + query_str + "\n" + record_str;
    Common.dbg("sending update request.  url: " + Controller.remote_url + " " + Common.stringify_obj(values));
    HTTP.post(Controller.remote_url, values, Controller.handle_update_response);
}

//'back-door' debugging/msg functions
Controller.update_msg = function(str) {
    last = Controller._msg_div.innerHTML;
    Controller._msg_div.innerHTML = str + "<br/>" + last;
    Controller.set_timer();
}

Controller.reset_msg = function() {
    Controller._msg_div.innerHTML = "";
}

Controller.warning_msg = function(str) {
    Controller.update_msg("<style color=#FF0000>" + str + "</style>");
}

Controller.handle_key_press = function(event, element) {
    var e = event || window.event;
    var keyCode = e.keyCode ? e.keyCode : e.charCode;
    var charForCode = String.fromCharCode(keyCode);
    if(e.altKey && charForCode == "\\") {
        Common.debug = (!Common.debug);
        if(Common.debug) {
            Common.dbg("debug on");
        }
    }
    else if(e.altKey && charForCode == "6") {
        //clear debug
        Controller.reset_msg();
    }
    else if(e.altKey && charForCode == "1") {
        //toggle the timer
        Controller.timer_on = (!Controller.timer_on);
        if(!Controller.timer_on) {
            //kill any existing timer
            clearTimeout(Controller.timer_obj);
        }
    }
    return true;
}

//function to handle timer events
Controller.timer_fun = function() {
    Controller.reset_msg();
}

Controller.set_timer = function() {
    if(setTimeout != undefined && Controller.timer_on) {
        Controller.timer_obj = setTimeout(Controller.timer_fun, Controller.timer_interval);
    }
}