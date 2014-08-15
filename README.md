DataSynk Framework
==================

Description
----------------------------------------------------------------------
Framework for managing data between JavaScript client and Perl CGI.

Purpose:
For managing simple/small datasets for/via web applications.

See Also:
contents.txt for listing of directories/files.

Components
----------------------------------------------------------------------
The following components have both JavaScript and Perl
implementations.

DataMgr:
  Provides querying & update facilities.

Parser:
  Parses strings into meaningful structures for the DataMgr.  Packs
  recordsets into 'canonical' strings to be passed between browser and
  'server'.

Controller:
  Facilitates interaction between Parser, DataMgr, and the application.

Record Format/Semantics
----------------------------------------------------------------------

The framework uses a 'canonical' record format roughly defined as:

    record:  field_values '\n'
    field_values: field=value [',' field_values]

All records will have the following fields

    _&id:  The unique id for this record
    _entity: The name of the entity this record is associated with

The server maintains the following

    _sync_id: id or version of dataset that this record is associated with

The client maintains

    _dirty: whether this record needs to be flushed to server

Fields that begin with '&' represent relationships to other
entity/records

Sample Records:

    _&id=1,_entity=User,Name=sam
    _&id=2,_entity=User,Name=ralph
    _&id=3,_entity=Survey,Name=s1,&User=1
    _&id=4,_entity=Survey,Name=s2,&User=2
    _&id=5,_entity=Question,Question=Home,&Survey=3
    _&id=6,_entity=Question,Question=Away,&Survey=4

Query Format/Semantics
----------------------------------------------------------------------

The framework uses the following query format to retrieve data:

    query: criterion
    criterion: field=value [',' criterion]

The criterion are 'AND'd to narrow the results.
The following fields have special meaning:

_entity:  This field is required.  It specifies the entities to
search.  Entities can be specified as a single entity or a hierarchy
of entities.  A hierarchy can be expressed using:

  '*':  All entities at 'current' level
  '**':  All entities from current level and below
  '*[0-9]': All entities from current level to specific depth

The 'current' level is defined either explicitly or defaults to the
'top' in the entity hierarchy.  If more than one entity is to be
searched, other fields must explicitly identify the entity they apply
to.

Sample Queries (and id's of returned records from Sample Records):

    _entity=User (returns 1, 2 from above)
    _entity=User/* (returns 1, 2, 3, 4)
    _entity=** (returns 1, 2, 3, 4, 5, 6)
    _entity=**,Survey.Name=s1 (returns 1, 2, 3, 5)
    _entity=Question,Question=Away (returns 6)

Domain Format/Semantics
----------------------------------------------------------------------

The framework uses the following domain format to describe data:
record:  field_values '\n'
field_values: field=value [',' field_values]

The following semantics apply:
_entity field:  Required and names the entity

Uniqueness: Fields that begin with '-' are part of the uniqueness
constraint of the entity (all unique fields are combined for this
test)

Related: Related fields are prefixed with '&' or '#'.  '&' means a
required/formal relationship by id, '#' is a pseudo-relationship only
by value (and it can be broken).

Values:  The value for non-related fields is a regex describing a
valid value.  The value for related fields is the name of the field in
the parent entity to be displayed that describes the parent entity.
For related fields, if the value begins with ':', it is to be
displayed as a 'radio' list.


Sample Domain Definitions:

    _entity=User,-Name=^\\w{1\\,8}$
    _entity=Survey,-Name=^\\w{1\\,16}$,-&User=Name
    _entity=Question,-Question=^[\\w\\?\\s']{1\\,32}$,-&Survey=Name
    _entity=Answer,-Answer=^[\\w\\s']{1\\,16}$,-&Question=Question
    _entity=Vote,-#Answer=:Answer,-&Question=Question,-&User=Name

A Vote record, as defined above, has a Question and User parent
relationship.  It also has a pseudo-relationship with Answer which is
displayed as a radio list.  The Answer, Question and User fields combined make a
Vote unique (i.e. a User canNOT vote for the same answer for the same
question twice).

Usage
----------------------------------------------------------------------

The intended use of this framework is to allow a browser-side
JavaScript application to:
- Query/Synchronize domain data from/with a server
- Perform local queries of data
- Perform local updates, flushing to server in a 'disconnected' way

JavaScript:

1. Include HTTP.js (from David Flanagan) Common.js, Parser.js,
DataMgr.js, Controller.js, Forms.js, Domain.js in any web-page from
which you want to manage data.
2. Set the server-side cgi URL via Controller.remote_url = url;
3. Retrieve remote data via Controller.remote_sync_query(query);
4. Retrieve local data via Controller.local_query(query);
5. Update local data via Controller.local_update(recordset);
5. Submit any local data to server for more permanent/shared storage
via Controller.flush();

See:  survey_vote.html and VotePageFunctions.js for sample

Perl (Server):

1.  Include Controller.pm in any Perl cgi script from which you want
to manage data.
2.  Set the 'heap file' via ds_set_heap_file (where data is stored)
3.  Call ds_handle_message to handle client requests/generate
responses

Sample Application
----------------------------------------------------------------------

The Survey application demonstrates the utility of the DataSynk
framework.

Functionality:
Creation/Maintenance of Users, Surveys, Questions, Answers and Votes.
Voting
Reporting

'Brief Test' Instructions:

1.  Navigate to http://cs.nyu.edu/~cjn212/survey_vote.html
2.  Login as 'Chris'
3.  Select a User whose Surveys you wish to complete
4.  Complete survey
5.  Click the 'Report' link and find a Survey to report on.

'Full Test' Instructions:

1.  Navigate to http://cs.nyu.edu/~cjn212/survey_manage.html
2.  Add a User and Update Survey/Question/Answer information
3.  Goto step 2 above, replacing 'Chris' with your User (Note that to
logout of the 'Vote' page, do a browser Refresh).

Installation
----------------------------------------------------------------------

Assumptions:  This installation assumes a 'working' &
'typical' Unix/Apache/Perl/CGI environment.

To run the sample application via apache and cgi module

1.  Clone this repo under your user's public_html dir
2.  Configure apache to allow perl cgi scripts under user's public_html dir
  
    YMMV, but for me, this was sufficient:

    - enable cgi scripts under user public_html dir by adding the following to conf/extra/httpd-userdir.conf

    <Directory /home/*/public_html> 
        Options +ExecCGI 
        AddHandler cgi-script .cgi 
    </Directory>

    - enable the cgi_module in httpd.conf

    More info available here:  http://httpd.apache.org/docs/2.2/howto/cgi.html#configuring

3.  Browse to `http://<server>/~<user>/survey_manage.html`

For custom applications, see 'Usage' above.

Todo
----------------------------------------------------------------------

- Refactor code (particularly Forms.js, Domain.js) to eliminate
  redundancies and make more reusable.
- Add Continuation/Comet capability (i.e. so a client can be updated
  of changes within it's data scope in realtime)
- Add more advanced query capability (i.e. Aggregation, Relational
  operators, etc).
