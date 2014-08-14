#!/usr/bin/perl
use CGI;
use CGI::Carp qw(warningsToBrowser fatalsToBrowser);

use Controller;
use Data::Dumper qw( Dumper );

# simple cgi to pass data to/fro Controller
# sample test url for records from browser
# http://hobo-d001/~chris/cgi-bin/data_synk.cgi?rec=user:+name%3Dchris%2Cid%3D12%0Asurvey:+id%3D15%2Cname%3Ds1
# notable ascii codes:
# '\n' = 0A
# '=' = 3D
# ',' = 2C

my $q = new CGI;

# set the heap file in users home dir
my $dir = (getpwuid($<))[7];
Controller::ds_set_heap_file("$dir/.data_synk");

# only param we care about is 'msg'
my $msg = $q->param("msg");

# print out header
print $q->header();
if($msg) {

    # hmm...eval doesn't seem to be allowed here..not sure how best to handle errors...
    my $msg_response = ds_handle_message($msg);

    print $msg_response;

}

exit;


