# Attribution

Cases in this directory are original French sentences, or user messages reused from the emergency gate in `app/src/app/api/chat/eval/cases.ts`.

CARE-Bench (ningkko/CARE-bench) is inspiration only. This eval uses its four-label scheme, mapped as need-info, self-care, consult, and emergency, and the idea of an underspecified first disclosure. It copies none of the CARE-Bench case text. The dataset metadata identifies the release as CC BY-NC 4.0. A repository LICENSE file was not present when this note was written.

The Hugging Face dataset BenoitJT-GIRARD/clinical-triage-bilingual is not adapted in this change. No case text from that dataset is included. Adapting it, with the attribution the card requires, is future work. The card states CC BY 4.0 and says an emergency physician did not review the cases.

Emergency `numbers` are the call list `classify` returns for that channel. A psychological emergency is 3114 then 15, because that is what the Jev client emits. This directory does not add the 24 adapted bilingual cases or a 60-case suite.
