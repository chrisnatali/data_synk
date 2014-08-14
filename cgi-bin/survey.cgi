#!/usr/bin/perl
use CGI;
use CGI::Carp qw(warningsToBrowser fatalsToBrowser);

#todo:
#handle errors
#handle url encoding (i.e. $, &, etc)

my $q = new CGI;

my $choice_title;
my @choices;
my $last_question = 0;
my $action;

# print out html 'headers'
print $q->header();
print $q->start_html("Survey");



# process params to initialize and set the action
my $survey_id = $q->param("survey_id");
my $qid = $q->param("qid");
my $last = $q->param("last");
if(! $survey_id) {
    if(! $q->param("choice")) {
        $action = "choose_survey";
    }
    else {
        $survey_id = $q->param("choice");
        $action = "next_question";
    }
}
if($survey_id) {
    if($last) {
        if($qid) {
            $action = "vote_and_print_results";
        }
        else {
            $action = "print_results";
        }
    }
    else {
        if($qid) {
            $action = "vote_and_next_question";
        }
    }
}

#debug
# foreach $name ( $q->param ) {
#    print "$name:\n";
#    foreach $value ( $q->param( $name ) ) {
#        print "  $value\n";
#    }
# }
# print "action: $action\n";

# process action
SWITCH: {
    $_ = $action;
    if (/^choose_survey/) {
        @choices = `../../survey view`;
        chomp(@choices);
        #todo:  handle no surveys
        $choice_title = "Select Survey";
        print $q->start_form();
        output_choices_and_buttons();
        print $q->end_form();
        last SWITCH;
    };
    if (/^next_question/) {
        set_next_question();
        set_question_choices();
        print $q->start_form();
        output_choices_and_buttons();
        output_survey_and_qid();
        print $q->end_form();
        last SWITCH;
    };
    if (/^vote_and_next_question/) {
        vote();
        set_next_question();
        set_question_choices();
        print $q->start_form();
        output_choices_and_buttons();
        output_survey_and_qid();
        print $q->end_form();
        last SWITCH;
    };
    if (/^vote_and_print_results/) {
        vote();
        print $q->start_form();
        print_results();
        print $q->submit(-name => "restart", -value => "Start Over");
        print $q->end_form();
        last SWITCH;
    };
    if (/^print_results/) {
        print $q->start_form();
        print_results();
        print $q->submit(-name => "restart", -value => "Start Over");
        print $q->end_form();
        last SWITCH;
    };
}

# end the html
print $q->end_html();
exit;

# vote with the choice param
sub vote {
    local $choice = $q->param("choice");
    #todo: handle errors?
    local $result = `../../survey vote $survey_id $qid \'$choice\'`;
}

sub print_results {
    #todo: cleanup
    local @questions = `../../survey view $survey_id`;
    chomp(@questions);
    print $q->p("Survey Results");
    foreach $question (@questions) {
        @q_choices = `../../survey view $survey_id $question`;
        chomp(@q_choices);
        #todo: handle no choices
        print "<b>Question: $q_choices[0]</b><br/>";
        @results = `../../survey results $survey_id $question`;
        chomp(@results);
        if(@results > 0) {
            print "<table border=1>";
            print "<tr><th>Answer</th><th>Count</th></tr>";
            foreach $result (@results) {
                $count = $result;
                $answer = $result;
                $count =~ s/(^\d+) .*$/$1/;
                $answer =~ s/^\d+ (.*)$/$1/;
                print "<tr><td>$answer</td><td>$count</td></tr>";
            }
            print "</table>";
        }
    }
}

# set the next qid and set $last_question
sub set_next_question {
    local @questions = `../../survey view $survey_id`;
    chomp(@questions);
    local $index;
    #todo:  handle no questions
    if(!$qid) {
        $qid = $questions[0];
        $index = 0;
    }
    else {
        $found = 0;
        NEXT_Q: for($i = 0; $i < @questions; $i++) {
            if($found) {
                $qid = $questions[$i];
                $index = $i;
                last NEXT_Q;
            }
            if($questions[$i] eq $qid) {
                $found = 1;
            }
        }
    }
    $last_question = ($index == (@questions - 1));
}

# set question based choices and the title
sub set_question_choices {
    local @questions = `../../survey view $survey_id $qid`;
    chomp(@questions);
    #todo: handle no question or choices
    $choice_title = $questions[0]; #1st element is the question
    for($i = 1; $i < @questions; $i++) {
        $choices[$i - 1] = $questions[$i];
    }
}

# output the choices and buttons
sub output_choices_and_buttons {
    output_choices();
    print "<br/>";
    output_buttons();
}

sub output_survey_and_qid {
    $q->param(-name => "survey_id", -value => "$survey_id");
    $q->param(-name => "qid", -value => "$qid");
    print $q->hidden(-name => "survey_id", -value => "$survey_id");
    print $q->hidden(-name => "qid", -value => "$qid");
}

# print choices
sub output_choices {
    print $q->p($choice_title);
    $check = 1;
    foreach $choice (@choices) {
        if($check) {
            print "<INPUT TYPE='radio' NAME='choice' VALUE=\'$choice\' checked>$choice<BR>";
            $check = 0;
        }
        else {
            print "<INPUT TYPE='radio' NAME='choice' VALUE=\'$choice\'>$choice<BR>";
        }
    }
}

#determines which buttons to output (Next, End (only if we're at last qid))
sub output_buttons {
    if($last_question) {
        print $q->submit(-name => "last", -value => "Next");
    }
    else {
        print $q->submit(-name => "next", -value => "Next");
        print $q->submit(-name => "last", -value => "Skip to the end");
    }
}
