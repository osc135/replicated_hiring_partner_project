# My Approach and Thoughts

## The Problem

Support bundles are a lot. You get a tarball with hundreds of files and somewhere buried in there is the reason everything broke. Engineers spend hours digging through these manually, and most of the time the answer is something straightforward. I wanted to build something that gets you to the answer in seconds instead of hours.

## How I Approached It

The biggest decision I made was splitting the analysis between a rule-based scanner and an LLM. The scanner runs first with 20 pattern-matching rules that look for known Kubernetes failure signals like CrashLoopBackOff, OOMKilled, and ImagePullBackOff. These are fast, free, and they never hallucinate.

Then the LLM gets those findings as context, along with the most relevant files from the bundle (events first, then pod state, then logs). It doesn't have to search for the problem because the scanner already found it. Instead it focuses on explaining *why* things broke and what to do about it. This makes the response faster, cheaper, and way more accurate than just throwing everything at the LLM and hoping for the best.

## Why Chat Instead of a Static Report

A PDF or static page would've been easier to build, but that's not how debugging actually works. You read the initial analysis and then you want to ask things like "what was happening before the pod crashed?" or "show me the events around that time." The chat interface lets you keep digging without starting over. I also stream the initial analysis so you see the severity and top findings right away while the rest is still generating.

## Similarity Search

I store embeddings of every analysis using pgvector, so when you upload a new bundle the system can pull up similar past incidents. This is basically how experienced engineers work already, they recognize patterns from things they've seen before. The more you use it, the more useful it gets.

## What I'd Do With More Time

The similarity matching works but I'd want to spend time verifying the results against ground truth and tuning the distance thresholds. Right now it surfaces related incidents but I'm not fully confident every match is genuinely useful.

I'd also love to add proactive warnings for services that are degrading but haven't failed yet. Nginx is a good example. It often shows signs of trouble like rising error rates and connection timeouts before it actually goes down. Catching that window and flagging it as a warning before it becomes a critical issue would be really valuable for on-call teams.

Multi-bundle diffing would be cool too. Comparing a healthy bundle against a broken one to see exactly what changed would make root cause analysis even faster.

## Takeaway

The interesting part of this problem isn't calling an LLM. It's everything around it: deciding which files to prioritize, managing token limits, validating output, and building up a knowledge base over time. Getting those pieces right is what makes the analysis actually reliable.
