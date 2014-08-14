# Description:
# Module for managing shared data
# Specific for use within Data Synk framework.
# TODO:  Document this better

package DataMgr;
use Parser;
use Common;

use Exporter;
@ISA = ("Exporter");
@EXPORT = qw(&update_heap &query &persist_all &get_heap_sync_id &sync_query);

# hash of managed records
my $heap = {};

# entity/relationship graph (hash of 'parent' -> 'children' entities)
my $rel = {};

# hash of entity to record id hash
my $heap_ent_idx = {};

# current max record #
my $heap_ct = 1; # > 0

# vars used in query processing
my $_q_entities = {}; #ents in scope of this query
my $_q_entity_idx = []; #ents sorted by depth (proc order)
my $_q_records = {}; #working set of record id's
my $_q_entity_criteria = {}; #criteria for each entity

# This is used as a data versioning id...incremented upon each update
# every record maintains there own
# this var represents the highest sync_id cross all records
my $heap_sync_id = 0;

# for debugging
sub _heap_ct { return $heap_ct; }
sub _rel { return $rel; }
sub _heap_ent_idx { return $heap_ent_idx; }
sub _heap { return $heap; }
sub _q_entities { return $_q_entities; }
sub _q_entity_idx { return $_q_entity_idx; }
sub _q_records { return $_q_records; }
sub _q_entity_criteria { return $_q_entity_criteria; }

# Updates the heap (clears existing)
# heap is a hash (id) of hashes (records)
# NOTE:  _&id and _entity fields are required
sub update_heap {

    # clear all heap related info
    $heap = {};
    $rel = {};
    $heap_ent_idx = {};
    $heap_ct = 1;

    my $record_array = $_[0];
    my $id = 1;
    my $sync_id = 0;
    for my $in_field_vals (sort { $a->{'_&id'} <=> $b->{'_&id'} } @{ $record_array }) {
        if(!exists($in_field_vals->{'_&id'})) {
            die "records need to have an _&id field when updating heap.";
        }

        if(!exists($in_field_vals->{'_sync_id'})) {
            die "records need to have a _sync_id field when updating heap.";
        }

        if(!exists($in_field_vals->{'_entity'})) {
            die "records need to have an _entity field when updating heap.";
        }

        $id = $in_field_vals->{'_&id'};
        $sync_id = $in_field_vals->{'_sync_id'};
        if($sync_id > $heap_sync_id) {
            $heap_sync_id = $sync_id;
        }

        my $entity = $in_field_vals->{'_entity'};
        my $record = {};

        # put the copy into an explicit loop in case we want to add more field validation
        for my $in_fld (keys %{ $in_field_vals }) {
            my $fld = $in_fld;
            my $val = $in_field_vals->{$in_fld};
            $record->{$fld} = $val;
        }

        $heap->{$id} = $record;

        # update entity idx
        if(!exists($heap_ent_idx->{$entity})) {
            $heap_ent_idx->{$entity} = {};
        }
        $heap_ent_idx->{$entity}{$id} = 1;
    }

    # we sorted the id's so we know that the last id is greatest...set the heap_ct to it
    $heap_ct = $id;

    #update the rel info
    _update_rel_all();

    #check for cycles
    _check_rel_cycle();
}

# build relationships
sub _update_rel_all {
    # add root node with no parents
    $rel->{'/'} = {};
    for my $id (sort { $a <=> $b } keys %{ $heap }) {
        my $record = $heap->{$id};
        _update_rel($record);
    }
}

# update rels based on single record
sub _update_rel {
    my $record = $_[0];
    my $entity = $record->{'_entity'};
    if(!exists($rel->{$entity})) {
        $rel->{$entity} = {};
        #all ents have '/' (root) as parent
        #until an entity adopts it
        $rel->{'/'}{$entity} = 1;
    }
    for my $fld (keys %{ $record }) {
        # does this rec have parent refs?
        my ($parent) = $fld =~ /^&(\w{1,})/;
        if($parent) {
            #add
            if(!exists($rel->{$parent})) {
                $rel->{$parent} = {};
            }
            $rel->{$parent}{$entity} = 1;
            # remove rel with root
            delete $rel->{'/'}{$entity};
        }
    }
}

# check rel graph for cycles
sub _check_rel_cycle {
    my $entity_hash = {};
    for my $ent (keys %{ $rel }) {
        if(_has_rel_cycle($ent, $entity_hash)) {
            my $str = stringify_obj($entity_hash);
            die "Cycle detected $str";
        }
    }
}

# recursive worker for cycle detection
sub _has_rel_cycle {
    my $entity = $_[0];
    my $entity_hash = $_[1];

    if($entity_hash->{$entity}) {
        #we've seen it before...CYCLE
        $entity_hash->{$entity}++;
        return 1;
    }
    $entity_hash->{$entity} = 1;
    for my $child (keys %{ $rel->{$entity} }) {
        if(_has_rel_cycle($child, $entity_hash)) {
            return 1;
        }
    }
    delete $entity_hash->{$entity};
    return 0;
}

# returns array of entities to be searched for entity_val
# entity_val : name/glob | glob
# glob : '*' | '**' | '*'\d{1,}
#
# semantics:
# *:  one level deep 'all' entities
# **: entities under this level
# *\d{1,}: entities to depth
# if name is specified, this is the top level entity to search from
sub _entities_from_val {

    my $entity_val = $_[0];

    my $start_entity = '/'; #root
    my $glob = "";
    my $max_depth = 0;
    my $entities = {};

    my ($ent, $gb) = $entity_val =~ /^(\w{1,})\/(.*)/;
    if($ent) {
        $start_entity = $ent;
        $glob = $gb;
    }
    else { # either top-level entity or glob
        ($ent) = $entity_val =~ /^(\w{1,})/;
        if($ent) {
            $start_entity = $ent;
            $entities->{$start_entity} = 1;
            return $entities;
        }
        else {
            # a glob
            $glob = $entity_val;
        }
    }

    # if here, it's a glob so validate it
    my ($res) = $glob =~ /^\*(\d{1,})/;
    if($res) {
        $max_depth = $res;
    }
    elsif($glob =~ /^\*\*/) {
        $max_depth = 99;
    }
    elsif($glob =~ /^\*/) {
        $max_depth = 1;
    }
    else { #invalid
        die "Invalid entity match criteria";
    }

    my $start_depth = 0;
    if($start_entity ne '/') {
        if(!exists($rel->{$start_entity})) {
            die "Invalid entity";
        }
        $entities->{$start_entity} = 1;
        $max_depth++; # bc we're starting at 1
        $start_depth++; #ditto
    }

    _entities_by_depth($start_entity, $start_depth, $max_depth, $entities);
    return $entities;
}

# recursive helper to get list of ents for search
sub _entities_by_depth {
    my $entity = $_[0];
    my $depth = $_[1];
    my $max_depth = $_[2];
    my $entity_hash = $_[3];

    if($depth < $max_depth) {
        if(!exists($rel->{$entity})) {
            die "Invalid entity: $entity";
        }
        for my $child (keys %{ $rel->{$entity}}) {
            $depth++;
            if(!exists($entity_hash->{$child}) || ($entity_hash->{$child} < $depth)) {
                $entity_hash->{$child} = $depth;
            }
            _entities_by_depth($child, $depth, $max_depth, $entity_hash);
        }
    }
}


#  Queries the heap for a specific entity
#  returns a list of id's
#  assumes _query_preproc has been called
#  to setup:
#  _q_entities
#  _q_entity_idx
#  _q_entity_criteria
#
#  assumes that entities that have a lower query specific
#  depth have already been queried and matched id's are in working set (_q_records)
sub _query_entity {

    my $entity = $_[0];
    my $results = {};
  outer: for my $rec_id (keys %{ $heap_ent_idx->{$entity} }) {
      my $rec = $heap->{$rec_id};

      # assume records match, iterate through criteria tuples and
      # if something doesn't match skip to next without adding to working set
      for my $tuple (@{ $_q_entity_criteria->{$entity}}) {
          if(!_record_tuple_match($rec, $tuple)) {
              next outer;
          }
      }

      # now global criteria
      for my $tuple (@{ $_q_entity_criteria->{'*'}}) {
          if(!_record_tuple_match($rec, $tuple)) {
              next outer;
          }
      }

      # now check if any ref fields match entities
      # outside scope of the query (skip to next if so)
    inner: for my $fld (keys %{ $rec } ) {
        my ($ref_entity) = $fld =~ /^&(\w{1,})/;
        if($ref_entity) {
            # only care if this entity is in the scope of the query
            if(!exists($_q_entities->{$ref_entity})) {
                next inner;
            }
            my $ref_id = $rec->{$fld};
            # check if refd record is in working set
            if(!exists($_q_records->{$ref_id})) {
                next outer;
            }

            my $ref_rec = $heap->{$ref_id};
            #only a sanity check
            my $actual_ent = $ref_rec->{'_entity'};
            if($actual_ent ne $ref_entity) {
                die "Referenced entity type doesn't match. ref_id: $ref_id ref entity: $ref_entity , actual: $actual_ent";
            }
        }
    }

      $results->{$rec_id} = 1;
  }
    return $results;
}

# determine if record matches tuple
sub _record_tuple_match {

    my $record = $_[0];
    my $tuple = $_[1];
    my $fld = $tuple->[0];
    my $val = $tuple->[1];

    if(ref($val) eq 'Regexp') {
        if(!($record->{$fld} =~ /$val/)) {
            return 0;
        }
    }
    else {
        if($record->{$fld} ne $val) {
            return 0;
        }
    }
    return 1;
}

# setup query processing
sub _query_preproc {

    my $tuples = clone_obj($_[0]);

    #clear out 'working' query data
    $_q_entities = {};
    $_q_entity_idx = [];
    $_q_entity_criteria = {};

    # setup entity info
    my $entity_val;
    for(my $i = 0; $i <  @{ $tuples }; $i++) {
        my ($fld, $val) = @{ $tuples->[$i] };
        if($fld eq '_entity') {
            $entity_val = $val;
            splice(@{ $tuples }, $i, 1); # get rid of _entity criteria
            last;
        }
    }
    if(!$entity_val) {
        $entity_val = '**';
    }

    $_q_entities = _entities_from_val($entity_val);
    @{ $_q_entity_idx } = sort { $_q_entities->{$a} <=> $_q_entities->{$b} } (keys %{ $_q_entities });

    # now associate the criteria with the global criteria or entity specific criteria
    for my $tuple (@{ $tuples }) {
        my ($fld, $val) = @{ $tuple };
        if($fld eq '_entity') {
            die "_entity cannot appear > once in criteria";
        }
        my ($entity, $fld_res) = $fld =~ /(\w{1,})\.(&{0,1}\w{1,})/;
        if($entity) {
            if(!exists($_q_entities->{$entity})) {
                die "Entity specified as field prefix not in query scope: $entity";
            }
            $fld = $fld_res;
        }
        else {
            $entity = '*'; #global criteria
        }
        my $ent_tuple = [];
        $ent_tuple->[0] = $fld;
        $ent_tuple->[1] = $val;
        if(!exists($_q_entity_criteria->{$entity})) {
            $_q_entity_criteria->{$entity} = [];
        }
        push @{ $_q_entity_criteria->{$entity} }, $ent_tuple;
    }
}


# Queries the heap
# query is a set of tuples representing fields/vals to query for
#
# returns a recordset (copy of what's in the heap)
# a recordset is an array of records (records are hashes)
sub query {

    my $tuples = $_[0];

    #preproc
    _query_preproc($tuples);

    #setup working records
    $_q_records = {};

    #iterate through entities in lo->hi depth order
    #already sorted by preproc
    for my $entity (@{ $_q_entity_idx }) {
        my @ids = (keys %{ _query_entity($entity) });

        for my $i (@ids) {
            $_q_records->{$i} = 1;
        }
    }

    my $results = [];
    my $ct = 0;
    for my $id (sort { $a <=> $b } keys %{ $_q_records }) {
        $results->[$ct] = clone_obj($heap->{$id});
        $ct++;
    }
    return $results;
}

# Updates or creates a record
# if the _&id field is provided, update existing, else create new
#
# For updates, all flds within new record overwrise vals in existing.
# if there are fields in existg rec not in the new rec, they remain.
#
# ensures that ref'd entities relate to existing record.
# NOTE:  The 'session' heap_sync_id is assigned to all records
# updated here.  This is incremented in the persist_all method
# so clients should NOT call this directly
sub _persist {

    my $record = $_[0];

    # ensure related entities exist
    for my $fld (keys %{ record }) {
        if($fld =~ /^&\w{1,}/) {
            my $id = $record->{$fld};
            if(!exists($heap->{$id})) {
                die "Entity refd to by field $fld has not been created.";
            }
        }
    }

    my $entity = $record->{'_entity'};
    my $id = $record->{'_&id'};

    #clone here so we don't mess with the consumer
    my $rec = clone_obj($record);
    $rec->{'_sync_id'} = $heap_sync_id; #update sync_id
    if($id) {
        if(exists($heap->{$id})) {
            #update existing
            #don't allow altering entity type
            if(exists($rec->{'_entity'}) and ($heap->{$id}{'_entity'} ne $entity)) {
                die "Cannot update entity type.";
            }

            $rec = merge($rec, $heap->{$id});
            $heap->{$id} = $rec; #disassoc with old rec
        }
        else {
            die "trying to update an id that does not exist.";
        }
    }
    else {
        # new record, we need the entity type
        if(!entity) {
            die "Records need to have an _entity field when updating heap.";
        }
        my $id = ++$heap_ct;
        $rec->{'_&id'} = $id;
        $heap->{$id} = $rec;
        if(!exists($heap_ent_idx->{$entity})) {
            $heap_ent_idx->{$entity} = {};
        }
        $heap_ent_idx->{$entity}{$id} = 1;
    }

    #update rel info
    _update_rel($rec);

    #check for cycles
    _check_rel_cycle();
}

# takes an array of records to persist
sub persist_all {
    my $records = $_[0];

    if(@{ $records } > 0) {
        #update the sync_id
        $heap_sync_id++;

        for my $rec (@{ $records }) {
            _persist($rec);
        }
    }
}

# get records defined by query whose sync_id's are > passed in sync_id
sub sync_query {
    my $query = $_[0];
    my $sync_id = $_[1];

    my $query_tuples = parse_query($query);
    my $records = query($query_tuples);
    my $result = [];

    #sort by sync_id hi->lo...assuming there are few records to be returned
    for my $rec (sort { $b->{'_sync_id'} <=> $a->{'_sync_id'}} (@{ $records })) {
        if($rec->{'_sync_id'} > $sync_id) {
            push @{ $result }, $rec;
        }
        else {
            last;
        }
    }
    return $result;
}

#accessor
sub get_heap_sync_id {
    return $heap_sync_id;
}

1;


