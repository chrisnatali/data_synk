//library of 'common' utility functions

var Common = {};
Common.debug = 0;
Common.debug_handler = 0;

/**
 * Function to associate an object with an event
 * @param obj The object containing the method to associate with the event
 * @param methodName The method within the object to handle the event
 * Reference: look for this method here:  http://www.jibbering.com/faq/faq_notes/closures.html
 */
Common.associateObjWithEvent = function(obj, methodName) {
        return (function(e) {
                e = e || window.event;
                return obj[methodName](e, this);
        });
}

/**
 * Function to split an input string by a split string AND
 * a look behind string.
 * @param inputStr String to be split
 * @param splitStr the String to split the inputStr on
 * @param behindStr The string that should appear immediately before the splitStr
 * to determine whether it's a valid splitStr
 * @param wantNotBehind if this is true, then only split if the behindStr is NOT behind the splitStr
 * @return an array of strings split on behindStr + splitStr
 * Example:  inputStr = "hello\+world"
 *           splitStr = "+"
 *           behindStr = "\"
 *           result[0] = "hello", result[1] = "world"
 */
Common.behind_split = function(inputStr, splitStr, behindStr, wantNotBehind) {
        var arr = new Array();
        var ct = 0;

        var nextStr = inputStr;
        var index = 0;
        while(index != -1) {
                index = nextStr.indexOf(splitStr, index);
                if(index == -1) {
                        arr[ct] = nextStr;
                }
                else {
                        var s = nextStr.slice(0, index);

                        //check if the str's last char matches the behindStr
                        var isBehind = (s.slice(s.length - behindStr.length, s.length) == behindStr);
                        //Keep adding to token if we haven't found a split string
                        if((isBehind && !wantNotBehind) || (!isBehind && wantNotBehind)) {
                                arr[ct] = s;
                                ct++;
                                //make the search string the tail of this string
                                nextStr =  nextStr.slice(index + splitStr.length);
                                index = 0;  //start search from front of string
                        }
                        else {
                            index++; //start search from next char
                        }
                }
        }
        return arr;
}

//merge 2 arrays into new array (input arrays are untouched)
//1st array 'wins' in a tie (i.e. it's elements are
//favored if both arrays contain the same element indices)
Common.merge = function(arr1, arr2) {

    if(!(arr1 instanceof Array) || !(arr2 instanceof Array)) {
        throw new Error("merge called with a non array.");
    }

    var arr = Common.clone_obj(arr2);

    for(var i in arr1) {
        arr[i] = arr1[i];
    }
    return arr;
}

//create an indexed array from an associative array
//return is an array indexed by int whose values
//are themselves objects with key, val properties
//key is the original assoc array key
//val is the keys value from the assoc array
Common.create_index = function(assoc_arr) {
    var ct = 0;
    var idx = [];
    for(var key in assoc_arr) {
        idx[ct] = {'key': key, 'val': assoc_arr[key]};
        ct++;
    }
    return idx;
}

//takes a key val assoc array and turns it into an array
//ordered in same order the assoc array is
Common.create_array = function(assoc_arr) {
    var ct = 0;
    var idx = [];
    for(var i in assoc_arr) {
        idx[ct] = assoc_arr[i]['key'];
        ct++;
    }
    return idx;
}

//sort assoc. array keys alphabetically
//returns array of hashes with key/val pairs
Common.sort_assoc_array = function(assoc_arr) {
    var idx = this.create_index(assoc_arr);
    idx.sort(function(a, b) {
            if(a['key'] > b['key']) {
                return 1;
            }
            else { return -1; }
        });
    return idx;
}



//returns a string representing object
    Common.stringify_obj = function(obj, max_depth) {
    var str_array = [];
    Common._stringify(obj, str_array, 0, max_depth);
    var str = str_array.join("\n");
    return str;
}

//print entire object
Common.print_obj = function(obj, max_depth) {
    var str = this.stringify_obj(obj, max_depth);
    print(str);
}

//helper for stringify
Common._indent_string = function(value, depth, sep) {
    var str = "";
    if(value == null) {
        value = 'null';
    }
    for(var i = 0; i < depth; i++) {
        str += sep;
    }
    str += value;
    return str;
}

//helper for stringify
Common._stringify = function(obj, str_array, depth, max_depth) {
    if(max_depth != undefined) {
        if(depth >= max_depth) {
            return;
        }
    }
    if (typeof obj != 'object' || obj == null) {
        str_array.push(Common._indent_string(obj, depth, " "));
    }
    for (var i in obj) {
        if (typeof obj[i] == 'object') {
           str_array.push(Common._indent_string(i + ": ", depth, " "));
           Common._stringify(obj[i], str_array, depth+1);
        } else {
           str_array.push(Common._indent_string(i + ": " + obj[i], depth, " "));
        }
    }
}

//do a deep copy of any object
Common.clone_obj = function(obj) {

    if (typeof obj != 'object' || obj == null) {
        return obj;
    }
    var c = [];
    for (var i in obj) {
        var prop = obj[i];
        c[i] = this.clone_obj(prop);
    }
    return c;
}

//returns the next or previous record sorted by id field
//if back, then get the previous
//return undefined if no records
Common.get_next_value = function(records, field, value, back, int_based) {

    if(records.length == 0) {
        return undefined;
    }


    //sort by field
    gv = function(val) { if(int_based) { return parseInt(val); } else { return val; }};
    asc = function(a, b) {
        if(gv(a[field]) > gv(b[field])) {
                return 1;
            }
            else { return -1; }}

    records.sort(asc);

    //get the next or previous record id
    var i = 0;
    var last_index = records.length - 1;
    for(i; i < records.length; i++) {
        var rec = records[i];
        if(value == undefined) {
            return rec[field]; //simply return 1st value if we don't have one
        }
        else if(rec[field] >= parseInt(value)) {
            if(back) {
                if (i != 0) {
                    return records[i - 1][field];
                }
            }
            else {
                if (rec[field] > parseInt(value)) {
                    return records[i][field];
                }
                else if(i != last_index) {
                    rec = records[i + 1];
                    return rec[field];
                }
            }
            //if we're here, it must've been 1st or last so just return original
            return value;
        }
    }
    //return the current if we're here (must not have found a next)
    return value;
}

//print stmt if debugging is on
Common.dbg = function(str) {
    if(this.debug) {
        if(typeof this.debug_handler == 'function') {
            this.debug_handler(str);
        }
        else {
            print(str);
        }
    }
}