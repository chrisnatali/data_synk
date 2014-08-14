# Description:
# Module with Common functionality

package Common;

use Exporter;
use Data::Dumper qw( Dumper );

@ISA = ("Exporter");
@EXPORT = qw(&clone_obj &merge &dbg &stringify_obj &print_obj);

my $debug = 1;  # if debug stmts are on/off

# courtesy of Randal L. Schwartz
sub clone_obj {
    my $this = shift;
    if (not ref $this) {
        $this;
    } elsif (ref $this eq "ARRAY") {
        [map clone_obj($_), @$this];
    } elsif (ref $this eq "HASH") {
        +{map { $_ => clone_obj($this->{$_}) } keys %$this};
    } elsif (ref $this eq "Regexp") {
        #just copy the regexp ref
        $this;
    } else { die "what type is $_?" }
}

# print details of obj
sub print_obj {
    print stringify_obj($_[0]);
}

# string details of obj {
sub stringify_obj {
    return Dumper($_[0]);
}

# merge 2 hashes into new hash
# 1st hash 'wins' in a tie...it's elements are favored if both hashes
# contain the same element keys
sub merge {
    my $hash1 = $_[0];
    my $hash2 = $_[1];

    if((ref $hash1 ne "HASH") || (ref $hash2 ne "HASH")) {
        die "merge called with a non-hash";
    }

    my $hsh = clone_obj($hash2);
    for my $key (keys %{ $hash1 }) {
        $hsh->{$key} = $hash1->{$key};
    }

    return $hsh;
}

# print dbg stmts
sub dbg {
    if($debug) {
        print "$_[0]\n";
    }
}
