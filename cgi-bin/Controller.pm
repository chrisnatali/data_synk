# Description:
# Module with Controller functionality
# for now, this reads/writes entire file on each call
#
# NOTE:  No real attempt is made to prevent users from
# clobbering each others data.  It's kind of a free
# for all.  Whoever flocks the $heap_file for writing
# first, wins.
#
# A client needs to understand that they can be working
# with 'stale' data and retrieve a fresh copy if needed.

package Controller;

use Parser;
use DataMgr;
use Common;
use Fcntl qw( :DEFAULT :flock );

use Exporter;
@ISA = ("Exporter");
@EXPORT = qw(&ds_handle_message &ds_set_heap_file);

# file to read/write data to
my $heap_file = "";

# filehandle used for accessing heap_file
# NOTE:  For updates, the Controller will lock the heap_file
# for the duration of reading the heap from disk,
# updating, querying and then flushing.
# More fine-grained locking may be required in a high-volume
# environment
my $heap_file_handle;



# helper that flushes heap to file
# assumes heap_file_handle is open
sub _flush_heap {

    # query to get all data
    my $q_tuples = parse_query('_entity=**');
    my $records = query($q_tuples);
    my $heap_data = pack_records($records);

    # write it all back (rewind back to beginning of file)
    seek($heap_file_handle, 0, 0) or die "can't rewind $heap_file: $!";
    print {$heap_file_handle} $heap_data or die "can't write heap data to $heap_file: $!";

}

# set the heap file
sub ds_set_heap_file {
    $heap_file = $_[0];
}


# hidden update sub for testing
sub _test_update_str {
    my $update_str = $_[0];
    my $message = "0\n_entity=**\n$update_str";
    my $msg_str = ds_handle_message($message);
    my $msg = parse_message($msg_str);
    return $msg->{'records'};
}

# hidden query sub for testing
sub _test_query_str {
    my $query_str = $_[0];
    my $message = "0\n$query_str\n";
    my $msg_str = ds_handle_message($message);
    my $msg = parse_message($msg_str);
    return $msg->{'records'};
}

# This is the interface to the outside world
# Takes a string in message format:
# line1:  SyncID (0 if never synced)
# line2:  Query (query indicating the context that client is concerned with)
# line3-N:  Records (any records to be updated)
# returns a message in same format where:
# line1:  SyncID updated with latest
# line2:  Echo of the request Query
# line3-N:  Records in the request Query context that need to be sync'd
sub ds_handle_message {
    my $message_str = $_[0];
    my $msg = parse_message($message_str);
    my ($sync_id, $query, $records) = ($msg->{'sync_id'}, $msg->{'query'}, $msg->{'records'});

    #open file, obtain RDWR flock, slurp it
    sysopen($heap_file_handle, $heap_file, O_RDWR | O_CREAT)
        or die "can't open $heap_file: $!";

    flock($heap_file_handle, LOCK_EX) or die "can't lock $heap_file: $!";

    #read it all in
    my $heap_data = do { local $/; <$heap_file_handle> }; # or die "can't read from $heap_file: $!";
    my $heap_records = parse_records($heap_data);
    update_heap($heap_records);

    #write the records regardless of conflicts
    my $parsed_records = parse_records($records);
    persist_all($parsed_records);

    #flush the heap
    _flush_heap();

    #close the filehandle as we have everything we need now
    #ensure that we don't leave any superfluous data at the end 1st
    truncate($heap_file_handle, tell($heap_file_handle))
        or die "can't truncate $heap_file: $!";

    close($heap_file_handle)
        or die "can't close $heap_file: $!";

    #query for records the client is interested in & doesn't have
    my $sync_recs = sync_query($query, $sync_id);
    my $records_str = pack_records($sync_recs);
    my $heap_sync_id = get_heap_sync_id();
    return "$heap_sync_id\n$query\n$records_str";
}

1;
