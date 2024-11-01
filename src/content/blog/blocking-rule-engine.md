---
title: 'Blocking Rule Engine'
description: 'Lorem ipsum dolor sit amet'
pubDate: 'Oct 12 2024'
heroImage: '/BlockingRules_v2.svg'
---

First challenge was to make abstraction that would be compatible with both Functional C# Api as well as Object oriented Api that was working with standard lib. Exceptions. 

Important detail was  that `Provider Api` also neded to Wrap existing Composition to handle DI appropriately.

At a High level flow looked something like this.

![Functional & object oriented Api](/BlockingRules_obj_vs_Func.svg)


Other part of the challenge was to work through and thorougly test all the posible & realistic config combinations with QA teams.
This proved to be longthy proces of few weeks in total when (when accounted for all implelmented rules at this point).
It also required a few sync with QA domain experts to properly configure desired states and pre-conditions needed before being able to call into the `GraphQL api Mutations` . 

Here are a few examples of the Rules that were implemented at that point:

Assign and Cancel Shift Bookings

![Assign and Cancel Shift Bookings](/Assign_cancel_shifts_br.svg)

Consecutive Bookings PerXDays Prevention

![ConsecutiveBookingsPerXDaysPrevention Rule](/ConsecutiveBookingsPerXDaysPrevention.svg)

ExhaustionPrevention

![ExhaustionPrevention Rule](/ExhaustionPrevention.svg)


//WIP there is still more in developement


`Dominik Polzer`