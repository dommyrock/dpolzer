---
title: 'Blocking Rule Engine'
description: 'Blocking rule engine development overview'
pubDate: 'Oct 12 2024'
heroImage: '/BlockingRules_v2.svg'
---

The first challenge was creating an abstraction compatible with both the Functional C# API and the object-oriented API that worked with the standard library exceptions.

An important detail was that the `Provider API` also needed to wrap the existing composition to handle dependency injection (DI / Lifetime scoping of dependent services) properly.

![Functional & object oriented Api](/BlockingRules_obj_vs_Func.svg)

This also involved propagating custom `Blocking logic` errors through both GraphQL middleware as well as HTTP middleware to be shown in the query responses.

The HTTP middleware was modified only because the product owners wanted custom HTTP error codes for these non-standard GraphQL responses (we used 403 as default, we also had different response codes for Exceptions thrown from other parts of the system).

> Why custom errors? 

We decided to add custom errors to the `Validation Engine` because there are quite a few possible combinations, making it easier to trace back and revalidate the exact `Rule` that triggered the error.

I also included `Tags` in the response payloads, allowing us to get a more granular view of the specific case (combination of rule attributes) that blocked the candidate assignment.

This version improves flow and readability, maintaining the original intent and technical detail.

Example of custom response thrown by the `Blocking Rule Engine`

```json
   "data": [
            {
                "failureReason": "business_rule",
                "message": "A shift that starts within 60 minutes cannot be self-cancelled, please call your Local Office for assistance.",
                "tag": "Any CandidateStatusId",
                "success": false
            }
        ],
 //...
```

Another part of the challenge involved working through and thoroughly testing all possible and realistic configuration combinations with the QA teams. This turned out to be a lengthy process, spanning a few weeks when accounting for all the implemented rules up to that point.

It also required several syncs with QA and PO domain experts to properly configure the desired states and preconditions before calling the `GraphQL API Mutations`.

## Here are a few examples of the Rules that were implemented at that point:

Each rule definition bellow includes a single rule configuration as an example, but in reality, there are multiple rows for each rule.

`Blocking Rule` Grouping config was structured like this. 

```xml
<BusinessRules>
	<Groups>
		<BusinessRulesGroup AboutType="Shift">
			<BusinessRule Type="SideJobPrevention" Enabled="True">
            <Rule ...>
            ... more rules 
         </BusinessRule>
	... more groups
</BusinessRules>
```

### Assign and Cancel Shift Bookings

![Assign and Cancel Shift Bookings](/Assign_cancel_shifts_br.svg)

```xml
<Rule ForCandidateStatusIds="7" Minutes="120" Enforce="true"/>
```
Description:
> As a Candidate assigned with a certain status, when I try to Book or Cancel a Shift in a certain status, once the threshold time limit passes I should be given an error that action I did was not allowed because of the enforced rule.

### Consecutive Bookings PerXDays Prevention

![ConsecutiveBookingsPerXDaysPrevention Rule](/ConsecutiveBookingsPerXDaysPrevention.svg)

```xml
<Rule ForCandidateStatusId="50" ForShiftStatusId="116" PeriodInDays="7" TimesBookingIsAllowed="5" Enforce="true">
```

Description:
> As a Candidate assigned with a certain status, when I try to Book a Shift in a certain status, in certain period of days, 1 time over the enforced threshold, I should be given an error that action I did was not allowed because of the enforced rule.

### ExhaustionPrevention

![ExhaustionPrevention Rule](/ExhaustionPrevention.svg)

```xml
<Rule ForCandidateStatusId="48" ForShiftStatusId="116" HoursAllowed="12" InLastXHours="24" Enforce="true">
```

Description:
> As a Candidate assigned with a certain status, when I try to Book consecutive Shifts in a certain status that together last X number of hours, in enforced Y period of hours, I should be given an error that action I did was not allowed because of the enforced rule.

### IndecisivePrevention

```xml
<Rule ForCandidateStatusId="36" IfShiftEndReasonIds="2" ForTheNextXDays="1" Enforce="True"/>
```

Description:
> As a Candidate assigned with a certain status, when I try to Book a Shift at Facility 2, after the fact I cancelled a shift at Facility 1, if time threshold `ForTheNextXDays` didn’t pass, I should be given an error that action I did was not allowed because of the enforced rule.

### SideJobPrevention

```xml
<Rule ForCandidateStatusId="858" RoleTypeId="3" Enforce="True" />
```

Description:
> As a Candidate with an active Contract Job match to which I am assigned with a certain status, when I attempt to Book a shift prior to the end of that Contract Job, I should be shown an error message that indicates that Booking Shifts while on an Active Contract Job that overlap with the shift start date is not allowed.

#### This was just the front gate into the actual Candidate Assignment ...

In practice, I hooked into an existing GraphQL mutation, `AssignCandidate`, which already had its own validation and executed several SQL transactions after passing the `Blocking Rule` validation.

![Assign candidate Mutation flow](/Assign_candidate_mutation.svg)


`Dominik Polzer`