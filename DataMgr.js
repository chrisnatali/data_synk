/**
 * Description:
 * Module for managing data
 * TODO:  Document this better (i.e. remote <-> local data mgmt...id's, protocol)
 *
 */

var DataMgr = {};

    //array of hashes id'd by the object ID
    DataMgr.heap = [];
    DataMgr.rel = []; //maintains relationship graph
    DataMgr.heap_ent_idx = [];
    DataMgr.heap_next_id = 0;

    //Temp vars used in query processing
    DataMgr._q_entities = []; //the entities looked at by DataMgr query
    DataMgr._q_entity_idx = []; //entities sorted by depth (processing order)
    DataMgr._q_records = []; //The working set of record id's
    DataMgr._q_entity_criteria = [];



/*
 * Updates the heap (clears existing heap if clear is true)
 * heap is an array of hashes (records)
 * NOTE: _&id (global id), and _entity fields are required
 *   _id (local id) represents the local id for the record
 * the local_id should not be used outside of this class
 */
DataMgr.update_heap = function(record_array, clear) {
    if(clear) {
        this.heap = [];
        this.heap_ent_idx = [];
        this.heap_next_id = 0;
    }

    //relationships get updated each time
    this.rel = [];

    //for now, this just takes the heap in 'as-is'
    //sort the records in lo-hi remote_id order so we know at the end that
    //we have the highest id
    var remote_id = 0;

    if(record_array) {
        record_array.sort(function(a, b) {
                if(a['_&id'] > b['_&id']) {
                    return 1;
                }
                else { return -1; }
            });
    }

    for(var i in record_array) {
        var in_field_vals = record_array[i];

        //ensure that the incoming record has an '_&id' field
        //representing the 'universal' id
        if(!in_field_vals['_&id']) {
            throw new Error("records need to have an _&id field when updating heap.");
        }

        //ensure that we know the entity
        if(!in_field_vals['_entity']) {
            throw new Error("records need to have an _entity field when updating heap.");
        }

        var record = [];
        var entity = in_field_vals['_entity'];

        for(var in_fld in in_field_vals) {
            var fld = in_fld;
            var val = in_field_vals[in_fld];
            record[fld] = val;
        }

        //use a dirty flag
        record['_dirty'] = 0;

        //add the remote idx ref
        remote_id = record['_&id'];

        //if there is an existing record by this remote_id, it'll be overwritten here
        this.heap[remote_id] = record;

        //update the entity index
        //NOTE:  This assumes that the server will never alter a records entity type
        if(!this.heap_ent_idx[entity]) {
            this.heap_ent_idx[entity] = [];
        }
        this.heap_ent_idx[entity][remote_id] = 1;
    }
    if(remote_id > this.heap_next_id) {
        this.heap_next_id = remote_id + 1;
    }

    //update the rel info
    //PERF:  It may not be necessary to iterate thru all records again to build relationships
    //in the update case...
    this._update_rel_all();
    //check for cycles
    this._check_rel_cycle();
}

//build up relationships
DataMgr._update_rel_all = function() {
    //add the root node which has no parents
    this.rel['/'] = [];
    for(var i in this.heap) {
        var record = this.heap[i];
        this._update_rel(record);
    }
}

//update the relationships based on a single record
DataMgr._update_rel = function(record) {
    var entity = record['_entity'];
    if(!this.rel[entity]) {
        this.rel[entity] = [];
        //all entities have '/' (root) as their parent
        //until an entity 'adopts' it.
        this.rel['/'][entity] = 1;
    }
    for(var fld in record) {
        //does this rec have parent refs?
        var res;
        //NOTE:  This skips _&id records
        if(res = fld.match(/^&(\w{1,})/)) {
            //add to rels
            var parent = res[1];
            if(!this.rel[parent]) {
                this.rel[parent] = [];
            }
            this.rel[parent][entity] = 1;
            //remove rel with root
            delete this.rel['/'][entity];
        }
    }
}

//check rel graph for cycles
DataMgr._check_rel_cycle = function() {
    var entity_hash = [];
    for(ent in this.rel) {
        if(this._has_rel_cycle(ent, entity_hash)) {
            var str = Common.stringify_obj(entity_hash);
            throw new Error("Cycle detected " + str);
        }
    }
}

//does the recursive work for check_rel_cycle
DataMgr._has_rel_cycle = function(entity, entity_hash) {

    if(entity_hash[entity]) {
        entity_hash[entity]++;
        return true; //found a cycle
    }
    entity_hash[entity] = 1;
    for(var child in this.rel[entity]) {
        if(this._has_rel_cycle(child, entity_hash)) {
            return true;
        }
    }
    delete entity_hash[entity];
    return false;
}

//returns array of entities to be searched for entity_val
//entity_val : name/glob | glob
//glob : '*' | '**' | '*'\d{1,}
//
//semantics:
//*:  one level deep 'all' entities
//**: entities under this level
//*\d{1,}: entities to depth
//if name is specified, this is the top level entity to search from
DataMgr._entities_from_val = function(entity_val) {

    var start_entity = '/'; //default to root
    var glob = "";
    var max_depth = 0;
    var res;
    var entities = [];
    if(res = entity_val.match(/^(\w{1,})\/(.*)/)) {
        start_entity = res[1];
        glob = res[2];
    }
    else { //it's either a top-level entity or glob match
        if(res = entity_val.match(/^(\w{1,})/)) {
            //it's an entity match
            start_entity = res[1];
            //just return here
            entities[start_entity] = 1;
            return entities;
        }
        else {
            //it's a glob
            glob = entity_val;
        }
    }
    //if we're here, it's a glob match so validate it
    if(res = glob.match(/^\*(\d{1,})/)) {
        //n level match
        max_depth = parseInt(res[1]);
    }
    else if(res = glob.match(/^\*\*/)) {
        //all level match
        max_depth = 99;
    }
    else if(res = glob.match(/^\*/)) {
        //single level match
        max_depth = 1;
    }
    else { //invalid
        throw new Error("Invalid entity match criteria");
    }



    //do not add '/' to entity list...it's just a dummy node
    //if start_entity is anything else, add it first
    var start_depth = 0;
    if(start_entity != '/') {
        if(this.rel[start_entity] == undefined) {
            throw new Error("Invalid entity");
        }
        entities[start_entity] = 1;
        max_depth = max_depth + 1; //because we are starting at 1
        start_depth = start_depth + 1; //ditto
    }

    this._entities_by_depth(start_entity, start_depth, max_depth, entities);
    return entities;
}

//recursive helper to get list of entities for search
DataMgr._entities_by_depth = function(entity, depth, max_depth, entity_hash) {
    if(depth < max_depth) {
        if(this.rel[entity] == undefined) {
            throw new Error("Invalid entity: " + entity);
        }
        for(var child in this.rel[entity]) {
            //we've now gone one level deeper
            depth++;
            //keep the deepest depth
            if(!entity_hash[child] || (entity_hash[child] < depth)) {
                entity_hash[child] = depth;
            }
            this._entities_by_depth(child, depth, max_depth, entity_hash);
        }
    }
}

/*
 * Queries the heap for a specific entity
 * returns a list of id's
 * assumes _query_preproc has been called
 * to setup:
 * this._q_entities = [];
 * this._q_entity_idx = [];
 * this._q_entity_criteria = [];
 *
 * assumes that entities that have a lower query specific
 * depth have already been queried and matched id's are in working set
 */
DataMgr._query_entity = function(entity) {

    var results = [];
    outer:
    for(var rec_id in this.heap_ent_idx[entity]) {
        var rec = this.heap[rec_id];

        //assume records match, iterate through fld val tuples and if
        //something doesn't match, skip to the next

        //start with entity specific criteria
        for(var i in this._q_entity_criteria[entity]) {
            var tuple = this._q_entity_criteria[entity][i];
            if(!this._record_tuple_match(rec, tuple)) {
                continue outer;
            }
        }

        //now global criteria
        for(var i in this._q_entity_criteria['*']) {
            var tuple = this._q_entity_criteria['*'][i];
            if(!this._record_tuple_match(rec, tuple)) {
                continue outer;
            }
        }

        //now check if any ref fields match entities
        //outside the scope of this query
        inner:
        for(fld in rec) {
            var res;

            //NOTE:  This skips _&id records
            if(res = fld.match(/^&(\w{1,})/)) {
                var ref_entity = res[1];
                //we only care if this entity is in the scope of the query
                if(!this._q_entities[ref_entity]) {
                    continue inner;
                }
                var rmt_id = rec[fld];

                //check if ref'd record is in our set
                //these are only id's at this point
                if(!this._q_records[rmt_id]) {
                    continue outer;
                }
                var ref_rec = this.heap[rmt_id];
                //this is really only a sanity check. *shouldn't happen*
                if(ref_rec['_entity'] != ref_entity) {
                    throw new Error("Referenced entity type does not match. record_id: " + rec_id + " refd id: " + rmt_id + " ref entity: " + ref_rec['_entity'] + " field_entity: " + ref_entity);
                }
            }
        }

        //add to results if all fld_vals have matched
        results[rec_id] = 1;
    }
    return results;
}

//helper for matching record to tuple
DataMgr._record_tuple_match = function(record, tuple) {

    var fld = tuple[0];
    var val = tuple[1];
    //if val is a regex, apply it...if result, then match
    //WARNING:  not sure if typeof regex always evals to 'function'
    if(typeof val == 'function') {
        if(!val(record[fld])) {
            return false;
        }
    }
    else {
        if(record[fld] != val) {
            //skip to next
            return false;
        }
    }
    return true;
}

//sets up for query processing
//sets:
//entity hash
//entity processing order
//global criteria
//entity specific criteria
DataMgr._query_preproc = function(tuples) {

    //clear out any existing 'working' query data
    this._q_entities = [];
    this._q_entity_idx = [];
    this._q_entity_criteria = [];

    //1st pass, setup entity info
    var entity_val;
    var my_tuples = Common.clone_obj(tuples);
    for(var i in my_tuples) {
        var tuple = my_tuples[i];
        var fld = tuple[0];
        var val = tuple[1];
        if(fld == '_entity') {
            entity_val = val;
            delete my_tuples[i]; //get rid of entity criteria
            break;
        }
    }
    if(!entity_val) {
        entity_val = '**';
    }

    this._q_entities = this._entities_from_val(entity_val);

    //now create a sorted (by depth) index of these entities.
    //This ensures proper processing order so that entites that
    //reference others will be 'inner joined' to those that
    //are already in the 'working set'.
    var idx_ents = Common.create_index(this._q_entities);
    idx_ents.sort(function(a, b) { return (a['val'] - b['val']); } );
    this._q_entity_idx = idx_ents;

    //Now, associate the criteria with the global criteria or entity specific criteria
    for(var j in my_tuples) {
        var tuple = my_tuples[j];
        var fld = tuple[0];
        var val = tuple[1];
        var entity;
        //sanity check
        if(fld == '_entity') {
            throw new Error("_entity cannot appear > once in criteria");
        }
        var res;
        if(res = fld.match(/(\w{1,})\.(&{0,1}\w{1,})/)) { //entity specific criteria
            entity = res[1];
            if(!this._q_entities[entity]) {
                throw new Error("Entity specified as field prefix not in query scope: " + entity);
            }
            fld = res[2];
        }
        else { //global criteria
            entity = '*';
        }
        var ent_tuple = [];
        ent_tuple[0] = fld;
        ent_tuple[1] = val;
        if(!this._q_entity_criteria[entity]) {
            this._q_entity_criteria[entity] = [];
        }
        this._q_entity_criteria[entity].push(ent_tuple);
    }

    //whew...all done setup work
    //the rest of the query process should now be straight-forward
}


/*
 * Queries the heap
 * query : [tuples]
 * tuple : [field, regex|value]
 *
 * Returns a recordset (a copy of what's in the heap)
 * recordset : [local_id]field_vals
 * field_vals : [field]val
 */
DataMgr.query = function(tuples) {

    //pre-process
    this._query_preproc(tuples);

    //setup the working record id array
    this._q_records = [];

    //iterate through entities in lo->hi depth order
    for(var i in this._q_entity_idx) {
        var entity = this._q_entity_idx[i]['key'];
        var ids = this._query_entity(entity);

        //add entities records to working set
        for(var j in ids) {
            this._q_records[j] = 1;
        }
    }

    var results = [];
    //return as array index starting at 0
    var ct = 0;
    for(var id in this._q_records) {
        var heap_record = this.heap[id];
        var return_record = Common.clone_obj(heap_record);
        //don't need to know if it's dirty outside here
        delete return_record['_dirty'];
        results[ct] = return_record;
        ct++;
    }

    return results;
}

//get a record by it's id
//should be fast
DataMgr.get_record = function(id) {
    var record;
    if(this.heap[id] != undefined) {
        var heap_record = this.heap[id];
        record = Common.clone_obj(heap_record);
    }
    return record;
}

/*
 * Updates or Creates a heap record
 * if the _id field exists, then find the record and
 * update it.  Otherwise, creates a new record.
 *
 * For updates, all fields within the new record overwrite
 * values in the existing record.  If there are fields in
 * the existing record not mentioned in the new record,
 * they remain. @see Common.merge
 *
 * ensures that any referenced entities have a remote id
 * (i.e. have been persisted remotely)
 *
 */
DataMgr.persist = function(record) {

    for(var fld in record) {
        //check if referred to entities have been remotely created
        if(fld.match(/^&\w{1,}/)) {
            var rmt_id = record[fld];
            if(this.heap[rmt_id] == undefined || (this.heap[rmt_id]['_dirty'] == 1)) {
                throw new Error("Entity ref'd to by field " + fld + " has not been created or is dirty");
            }
        }
    }

    var entity = record['_entity'];
    var id = record['_&id']
    var rec;
    if(id) {
        if(this.heap[id]) {
            //update existing
            //don't allow altering the entity type
            if(entity != undefined) {
                if(this.heap[id]['_entity'] != entity) {
                    throw new Error("Cannot update entity type.");
                }
            }
            rec = Common.merge(record, this.heap[id]);
            rec['_dirty'] = 1;
            this.heap[id] = rec;
        }
        else {
            throw new Error("trying to update an id that does not exist.");
        }
    }
    else {
        //new record
        //we need an entity type here
        if(!entity) {
            throw new Error("Records need to have an _entity field when updating heap.");
        }

        rec = Common.clone_obj(record);
        //set the new id.
        //NOTE:  This new id may overlap that of the server...we need to ensure that
        //the hash index of the heap is NEVER used as a remote identifier as this will
        //confuse the server, which expects no identifier for new records
        id = ++this.heap_next_id;
        rec['_dirty'] = 1;
        this.heap[id] = rec;
        //update the entity index
        if(!this.heap_ent_idx[entity]) {
            this.heap_ent_idx[entity] = [];
        }
        this.heap_ent_idx[entity][id] = 1;
    }

    //update relationship info
    this._update_rel(rec);
}

//takes an array of records and delegates to persist
DataMgr.persist_all = function(records) {
    for(rec in records) {
        this.persist(records[rec]);
    }
}

//clear all the dirty records (to be called after we know we've been updated)
DataMgr.clear_dirty_records = function() {
    var deleted = [];
    for(var id in this.heap) {
        var record = this.heap[id];
        if(record['_dirty'] == 1) {
            deleted[id] = 1;
            delete this.heap[id];
        }
    }

    //also need to remove the entity_index refs
    for(var entity in this.heap_ent_idx) {
        for(var j in this.heap_ent_idx[entity]) {
            if(deleted[j]) {
                delete this.heap_ent_idx[entity][j];
            }
        }
    }
    deleted = [];
}

//return all the dirty records
DataMgr.get_dirty_records = function() {
    var result = [];
    for(var id in this.heap) {
        var record = this.heap[id];
        if(record['_dirty'] == 1) {
            var dirty_rec = Common.clone_obj(record);
            //since we know this is used for flushing, we get rid
            //of _dirty field as it has no meaning outside the client
            delete dirty_rec['_dirty'];
            result.push(dirty_rec);
        }
    }
    return result;
}