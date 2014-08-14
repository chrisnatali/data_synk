# Description:
# Module for parsing formatted strings of data.
# Specific for use within Data Synk framework.
# parse_query and parse_records assume that
# the input string has 'escaped' the chars [,=]
# with a preceding '\' in any user values.
#
# General Query/Record Format:
# A record consist of field=value pairs
#
# *special* fields
# _entity : The name of the entity
# _&id : The 'global' id of the record
# &<entity_name> : The id of a related record
#                  entity_name is that of the related record.
#
# Sample Records:
# _&id=1,_entity=user,name=chris
# _&id=2,_entity=user,name=ralph
# _&id=3,_entity=survey,name=s1,&user=1
# _&id=4,_entity=survey,name=s2,&user=2
#
# Sample Queries:
# _entity=user,name=ralph (returns 2nd record above)
# _entity=survey,&user=2 (returns 4th record above)

package Parser;
use Common;

use Exporter;
@ISA = ("Exporter");
@EXPORT = qw(&parse_message &pack_message &parse_records &parse_query &pack_records);

# parses a string into 3 records based on the 1st 2 \n's
# encountered.  The 3 records represent:
# SyncID:  ID used for client/server data sync
# Query:  The query scope for the sync
# Records:  The records to be synced
# returns message hash
#
sub parse_message {
    my $packed_message = $_[0];
    my $message = {};
    my ($sync_id, $query, $records) = $packed_message =~ /([^\n]*)\n([^\n]*)\n(.*)/s;

    if(defined $sync_id) {
        $message->{'sync_id'} = $sync_id;
        $message->{'query'} = $query;
        $message->{'records'} = $records;
        return $message;
    }
    else {
        die "Invalid message format.";
    }
}

# reverse of parse_message
sub pack_message  {
    my $msg = $_[0];
    my $packed_message = join("\n", ($msg->{"sync_id"}, $msg->{"query"}, $msg->{"records"}));
    return $packed_message;
}

# parses a string into a tuple array of criterion
# criteria is an array of tuples
# query : criterion
# criterion : field=value [',' criterion]
#
# uses negative lookbehind to ignore escaped tokens [,=]
# returns a reference to the tuple array
sub parse_query {

    my $query_str = $_[0];
    my $tuples = [];

    my @criterion = split(/(?<!\\),/, $query_str);

    for my $criteria (@criterion) {
        # split on '=', (ignoring \= shouldn't be needed cuz field isalpha)
        # NOTE:  allow & and . in spots within field
        my ($fld, $prefix_dot, $prefix, $val) = $criteria =~ /^\s*(((_{0,1}&{0,1}[\w]{1,})\.){0,1}_{0,1}&{0,1}[\w]{1,})=(.*)$/;
        if(! $fld) {
            die "Empty field in criteria is not allowed.";
        }

        # convert val to regex if it's wrapped in /'s
        my ($result) = $val =~ /^\/(.*)\/$/;
        if($result) {
            $val = qr/$result/;
        }

        # add field to field array for the entity
        my $tuple = [ $fld, $val ];
        push @{ $tuples }, $tuple;
    }

    return $tuples;
}

# parses a string into an array of records
# record is a hash of field/values
# record:  field_values '\n'
# field_values : field=value [',' field_values]
#
# uses negative lookbehind to ignore escaped tokens [,=]
# returns a reference to the record array
sub parse_records {
    my $record_array = [];
    my @records = split /\n/, $_[0];
    for my $rec (@records) {
        #skip blank lines
        next if(!$rec);

        @fld_vals = split(/(?<!\\),/, $rec);
        my $rec_ref = {};
        for my $fld_val (@fld_vals) {
            # split on '=', (ignoring \= shouldn't be needed cuz field isalpha)
            # NOTE:  & allowed
            my ($fld, $val) = $fld_val =~ /^\s*(_{0,1}&{0,1}\w{1,})=(.*)$/;
            if(! $fld) {
                die "Empty field in record is not allowed.";
            }
            if( exists($rec_ref->{$fld}) ) {
                die "Field $fld already exists in record.";
            }

            # unescape ,=
            $val =~ s/\\([,=])/$1/g;

            # add field to field array for the entity
            $rec_ref->{$fld} = $val;
        }
        push @{ $record_array }, $rec_ref;
    }
    return $record_array;
}

# reverse of parse_records
# takes a reference to an array of record refs
sub pack_records {
    my $record_array = $_[0];
    my @record_str_array;
    for my $rec_ref (@{$record_array}) {
        my $rec = clone_obj($rec_ref);
        my @fld_val_join;
        for my $fld (sort _sort_record_keys keys %{ $rec }) {
            my $val = $rec->{$fld};
            # escape ,=
            $val =~ s/([,=])/\\$1/g;
            push @fld_val_join, "$fld=$val";
        }
        my $fld_val_str = join ",", @fld_val_join;
        push @record_str_array, "$fld_val_str";
    }
    return join "\n", @record_str_array;
}

# sort in view-friendly way
# i.e. _entity 1st, _id 2nd, _&id 3rd, then the rest by alpha
my %fld_idx;
$fld_idx{'_entity'} = 1;
$fld_idx{'_id'} = 2;
$fld_idx{'_&id'} = 3;
sub _sort_record_keys {
    if(exists($fld_idx{$a}) && exists($fld_idx{$b})) {
        return ($fld_idx{$a} <=> $fld_idx{$b});
    }
    elsif(exists($fld_idx{$a})) {
        return -1;
    }
    elsif(exists($fld_idx{$b})) {
        return 1;
    }
    elsif($a gt $b) {
        return 1;
    }
    else {
        return -1;
    }
}
