---
title: '250 project Monolith repository build metrics'
description: 'Measuring 250 project Monolith repository build metrics and ploting the results with python scripts'
pubDate: 'May 15 2024'
heroImage: '/top10_most_expensive_build.webp'
---


## Project intro
I had a chance to work on the larger codebase for almost 4 years as part of one of Bullhorn core teams.<br>
There were hundreds of repositories as part of the org, but this particular one was older monolith .NET project that consisted of 250 projects in total. (there was also separate Mobile + Portal repos but this was the core of the system)<br> 

It has been under heavy development for over 20 years and almost any technology you can think of is used inside of it.
This monstrosity had accumulated ~3+ Million lines of code (5+ Million with all the build artifacts). 

During one of my investigations I mada an effort to document and present build times of the particular projects.<br>
Plan was to introduce some sort of measurable metrics that we could continously monitor and that would allow us to keep track of any drastic increases.

I used following script to get 'msbuild' details

```bash
msbuild ./HRNet.sln /clp:PerformanceSummary
```
Which outputs I fed to my custom pyhon plotter scripts. (that can be found in 'project repository' linked bellow)

For more detailed Build tree inspection I used this great [Binary log GUI tool](https://msbuildlog.com/).

```bash
msbuild YourSolution.sln /bl
```
[Binary log msbuild repo](https://github.com/dotnet/msbuild/blob/main/documentation/wiki/Binary-Log.md)

You can check out this [Project repository](https://github.com/dommyrock/py-build-times/tree/main) if you are interested in the python scripts used in the process.<br>
Repository also contains examples of build metrics outputs. 


`Dominik Polzer`