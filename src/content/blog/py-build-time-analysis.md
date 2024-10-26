---
title: '250 project Monolith repository build metrics'
description: 'Measuring 250 project Monolith repository build metrics and ploting the results with python scripts'
pubDate: 'May 15 2024'
heroImage: '/top10_most_expensive_build.webp'
---


## Project intro
I had a chance to work on the larger codebase for almost 4 years as part of one of Bullhorn core teams.<br>
There were hundreds of repositories as part of the org, but this particular one was older monolith .NET project that consisted of 250 projects in total. (there was also separate Mobile + Portal repos but this was the core of the system)<br> 

It's been in intense development for over 20 years, and practically every technology you can think of is used in it. This behemoth has accumulated around 3+ million lines of code (over 5+ million when you include all the build artifacts).

During one of my investigations, I worked to document and present the build times for specific projects. The plan was to introduce measurable metrics we could monitor continuously to help track any significant increases.

I used following script to get 'msbuild' details:

```bash
msbuild ./HRNet.sln /clp:PerformanceSummary
```
Which outputs I fed to my custom pyhon plotter scripts. (that can be found in 'project repository' linked bellow)

For more detailed Build tree inspection I used this great 
<a href="https://msbuildlog.com" target="_blank">Binary log GUI tool</a>.

```bash
msbuild YourSolution.sln /bl
```

---

<a href="https://github.com/dotnet/msbuild/blob/main/documentation/wiki/Binary-Log.md" target="_blank">Binary log msbuild repo</a>

You can check out this 
<a href="https://github.com/dommyrock/py-build-times/tree/main" target="_blank">Project repository</a> if you are interested in the python scripts used in the process.<br>
Repository also contains examples of build metrics outputs. 


`Dominik Polzer`

