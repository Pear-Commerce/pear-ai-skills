# AI System Risk Assessment Questionnaire Pear

Source file: `AI System Risk Assessment Questionnaire - Pear Commerce.docx (1).pdf`

## Page 1

CONFIDENTIAL
FOR INTERNAL USE ONLY
Artificial Intelligence (AI) System Risk Assessment Questionnaire
Please complete this questionnaire to help with assessing the risk of an AI system for use by
McCormick (MKC). Please note these questions may be broader than necessary depending on
the use case. Based on the answers provided, we may need to dive deeper into certain areas.
Regardless of risk, all deployed AI systems must meet the following minimum requirements:
● Include a transparency disclaimer1 that informs individuals they are interacting with an AI
system;
● Ensure the generated content is marked as generated (or manipulated) by AI, which mark
should be in a machine readable format;
● Comply with MKC’s data retention / deletion policy, and protocols for proper security
controls and testing;
● Educate users on intended uses and limitations of the AI system and provide instructions
for use to enable them to interpret the output;
● Manage input / output (e.g., bias detection, testing for accuracy / harm, use of sensitive or
third-party data, etc.);
● Capture how the tool is trained over time; and
● Establish procedures for ongoing monitoring, including human oversight
For reference, please review Attachment 1, which provides an overview of the AI systems deemed
to be prohibited, high-risk and limited-risk under the European Union’s (EU) AI Act.
1. Please provide the following information:
● Name the MKC business leader(s) who have or will approve this AI system.
● Describe the business case/potential benefit to MKC.
● List the MKC regions which will use this AI system.
● Indicate the timing for deployment of this AI system.
Pear Commerce uses AI to assist in properly processing recipe definitions. The AI systems being
leveraged are commodity systems like ChatGPT, Claude, Gemini, etc. Pear’s use of this systems
is limited. It does not include any re-training and uploading or sharing of data. The use cases at
Pear, at this time are narrow and mission-specific limited to text parsing.
2. What is the purpose and use of the AI System and its output? Who will have access to the
output? Will the output be used internally or externally? If a third-party copies the output, is
1 Here is an example of an adequate disclaimer for most AI systems: You are interacting with an artificial intelligence
(AI) system, which uses an AI language model to generate content. If you use any AI generated content in your work,
then you must mark such work as being generated or manipulated by AI. Please note that AI generated content may
not be entirely error-free or up-to-date. Please independently verify the content and consult with McCormick’s relevant
subject matter experts for specific advice or information. McCormick does not assume any responsibility or liability for
the use or interpretation of any AI generated content. For this AI system, please report any offensive or discriminatory
content to [insert designated contact person or function that manages the particular AI tool].
1
Last Rev. February 2025

## Page 2

CONFIDENTIAL
FOR INTERNAL USE ONLY
there a concern?
Pear Commerce currently uses AI assistance for text analysis. The output is only used
internally in Pear Commerce software. There’s no concern about copying the output as it does
not contain any sensitive data.
3. Will the AI system be created with or rely on a third-party solution (e.g., MSFT Azure
OpenAI, Google Gemini)? If so, which one? Does the third-party own or have a license
to its underlying training or other data and/or input and output sources or otherwise
protect MKC from third-party IP liability (third-party infringement indemnity)?
Pear Commerce will not be creating an AI system in this context but simply leveraging the
abilities of AI systems. We do not provide any data to further train the models being used.
4. Will the third-party solution be trained on MKC confidential, proprietary, or sensitive
information? Please note this covers a wide scope of information as described in
McCormick’s Trade Secrets, Confidential Information, and Proprietary Information
Policy.
No, it will not be trained on any MKC data.
5. Does the third party have any rights (or claim any rights) in the input and/or output from
the AI system (including the rights to further train the AI system)?
No, the third party has no rights on the data being sent as input.
6. Will the AI system process any MKC confidential, proprietary, or sensitive information?
Is personal information, biometric information, or PHI used with the AI system?
No, the AI system in use will not process any MKC data.
7. Where will the AI system be hosted? Will any MKC confidential, proprietary, or
sensitive information leave the MKC environment?
We do not have any insight into where the AI systems are hosted but they will not receive any
confidential, proprietary, or sensitive information.
8. Will any third-party be involved in the development of the AI system? If so, will the
third-party use sub-contractors to perform some or all of the work?
No, there are currently no plans to develop an independent AI system nor include any third
party in the development of any AI systems.
9. How will the AI system be integrated with existing MKC systems and infrastructure?
It will not be integrated into MKC systems or infrastructure. The integration exists solely in the
Pear Commerce software system.
2
Last Rev. February 2025

## Page 3

CONFIDENTIAL
FOR INTERNAL USE ONLY
10. Who will have access to the AI system? Will any third-party or external users have
access to it? Are there any restrictions on who can access it internally?
Only Pear Commerce and its employees will have access to the AI system in use.
11. Will a human be involved to review the AI system output before it is used? If not, will
there be a process to audit the AI system output for accuracy/appropriateness?
The AI system output is reviewed to ensure accuracy.
12. What is the process for testing and validating the AI system? What type of testing will
be performed to identify whether the AI system produces biased or unfairly
discriminatory results?
The areas of the system we’re using the AI is limited to text and image processing to extra
information to avoid any ability to generate biased or discriminatory results.
13. How does the AI system mitigate inaccurate, biased and unfairly discriminatory
outputs? What are the plans to update and correct the AI system to address such
issues?
All output of the AI system in use is verified for accuracy.
14. Does the AI system retain logs regarding the input and output from the AI system?
Does the AI system retain and log the prompts and outputs for data retention?
The AI system does retain logs for their own service usage. We are unable to provide the full
extent to which they log the requests. However, no sensitive, confidential, or proprietary
information is sent to the AI system.
15. What measures are in place to protect the security, integrity and availability of the AI
system and the associated data?
The AI system has its own authorization and authentication system.
16. Have any guardrails or limits on the use of the AI system been identified? Will the users
be trained on these or any other limitations?
Pear Commerce uses AI in specific situations to avoid the well-known pitfalls of AI systems.
17. What is the process to monitor the performance of the AI system for accuracy and
drift? What is the process to remove or adjust problematic content/output from the AI
system and any uses of it throughout McCormick (internal and external facing)?
We do not train the AI system so we cannot speak to the specifics of how it’s trained. We
ensure accuracy via manual review of the output.
3
Last Rev. February 2025

## Page 4

CONFIDENTIAL
FOR INTERNAL USE ONLY
Attachment 1
Prohibited, High-risk and Limited-risk AI Systems under the EU AI Act (AIA)
Prohibited AI Systems – effective February 2, 2025
Article 5 of the AIA prohibits the placing on the market / putting into service / use of AI systems
with unacceptable risks within the EU. These prohibited systems include the following (with
specific exceptions):
● deploying subliminal, manipulative, or deceptive techniques to martially distort behavior
and impair informed decision-making, causing significant harm;
● exploiting vulnerabilities related to age, disability, or socio-economic circumstances to
martially distort behavior, (reasonably likely) causing significant harm;
● biometric categorization systems inferring sensitive attributes;
● social scoring, i.e., evaluating or classifying individuals or groups based on social behavior
or personal characteristics, causing detrimental or unfavorable treatment of those people;
● assessing the risk of an individual committing criminal offenses solely based on
profiling or personality traits and characteristics;
● compiling facial recognition databases, through untargeted scraping;
● inferring emotions in workplaces or educational institutions, except of AI systems for
medical and safety reasons;
● 'real-time' remote biometric identification (RBI) in publicly accessible spaces for law
enforcement (unless the use is strictly necessary in certain defined scenarios).
High-risk AI Systems – Annex III effective August 2, 2026, and Annex II effective August 2,
2027
Article 6, Annex II and III of the AIA obligates predominantly providers and deployers of AI
systems to implement a wide range of AI governance and technical interventions (incl.
transparency, risk management, accountability, data governance, human oversight, accuracy,
robustness and cybersecurity) during the design and development stages, and to be monitored
and maintained throughout the AI lifecycle.
There are two main groups of high-risk AI systems:
“Annex II systems”, i.e. systems intended to be used as a safety component of a product or which
is itself a product covered by EU laws in Annex II and required to undergo a conformity
assessment; these are typically AI systems used in the context with risk-prone, highly regulated
products:
● Machinery ● Appliances burning gaseous fuels
● Toys ● Medical devices
● Recreational and personal watercraft ● In vitro diagnostic medical devices
4
Last Rev. February 2025

## Page 5

CONFIDENTIAL
FOR INTERNAL USE ONLY
● Equipment and protective systems ● Civil aviation security
intended for use in potentially
explosive atmospheres ● Civil aviation and aircraft
● Radio equipment ● Marine equipment
● Pressure equipment ● Agricultural and forestry vehicles
● Cableway installations ● Rail systems, motor vehicles and trailers
● Personal protective equipment ● Two- or three-wheel vehicles and
quadricycles
“Annex III systems”, i.e. AI systems intended to serve a special purpose listed in Annex III, which
are (with specific new exceptions introduced under the compromise text for systems for which do
not pose any significant harm, to health, safety or fundamental right):
● non-banned biometrics;
● critical infrastructure;
● education and vocational training, including systems to determine access or admission,
evaluate learning outcomes, monitor and detect prohibited behavior during tests;
● employment, workers management and access to self-employment, including systems for
recruitment, selection, monitoring, termination or promotion;
● access to and enjoyment of essential public and private services, including credit scoring,
and pricing in health and life insurance;
● law enforcement;
● migration, asylum and border control management;
● administration of justice and democratic processes, including election-influencing AI, e.g.
recommender algorithms on social media.
Limited-risk AI Systems – effective August 2, 2026
Article 52 of the AIA requires limited-risk AI systems to meet the following transparency
requirements:
Purpose or function of AI Transparency requirement
System
AI systems intended to Providers must inform those individuals they are interacting
directly interact with with an AI system (unless this is obvious or authorized by law to
individuals detect and prevent crime).
AI systems able to create Providers must ensure that generated content is marked as
synthetic audio, image, generated by AI, mark should be in machine readable format.
video, or text
Emotion recognition or Deployers must inform individuals that they are exposed to
biometric categorization the operation of the system and comply with the GDPR
(based on biometric data) (exemption for systems permitted by law to detect, prevent, and
investigate criminal offences).
Deep fake Deployers must disclose that content has been artificially
generated or manipulated (exemptions for uses authorized by
5
Last Rev. February 2025

## Page 6

CONFIDENTIAL
FOR INTERNAL USE ONLY
law to detect, prevent, investigate, and prosecute criminal
offences). For creative works, may disclose in an appropriate
manner that does not hamper the display or enjoyment of the
work.
Generating or manipulating Deployers must disclose that text has been artificially
text published with the generated, unless the content has undergone human review
purpose of informing the (exemption for use authorized by law to detect, prevent,
public on matters of public investigate, and prosecute criminal offences).
interest
The transparency disclaimer must be provided to the people concerned in a clear and
distinguishable manner and must conform to accessibility requirements (i.e., for those with
impaired vision etc). In addition, it must be provided at the latest of the time of the first interaction
or exposure with the people concerned.
If data protection laws or other laws impose more precise or stricter requirements, these must be
complied with as well. GDPR fairness, transparency and automated decision-making requirements
will lead to a requirement to disclose the use of AI systems which lead to automated decision
making outside of the specific use cases identified in the AIA above.
The EU AI Office European AI Office | Shaping Europe’s digital future (europa.eu) is required to
encourage and facilitate EU codes of practice regarding the detection and labelling of artificially
generated content. As of May 2024, no such codes have been issued in draft or final form yet.
Against this backdrop, the first point will be to determine whether transparency requirements are
applicable.
Certain use cases (e.g., a biometric based emotion recognition system analysing speech patterns)
will require a notice before accessing the application. Crude pop ups which need to be clicked
away and accepted before accessing the application will be acceptable. If personal data is being
processed, it will also be necessary to find a GDPR ground to legitimize such processing – this
might require consent – that consent could be built into the pop up. There may be issues as to
whether using such a system can be made conditional on accessing a service or platform.
If, for example, a company is using an LLM with a vectorized reference database to create
marketing images, videos or audio, it will be deemed a deployer of that system. If the copy is not
reviewed by a human with editorial control before publication, the company will need to include a
clear notice that the copy was produced by AI.
6
Last Rev. February 2025
