import { useEffect } from 'react';
import { useUser } from '@clerk/clerk-react';
import posthog from 'posthog-js';

const SURVEY_SHOWN_STORAGE_PREFIX = 'posthog-acquisition-survey-shown:';
const ACQUISITION_SURVEY_ID = import.meta.env.VITE_PUBLIC_POSTHOG_ACQUISITION_SURVEY_ID;

export function PostHogSurveyTrigger() {
    const { user } = useUser();

    useEffect(() => {
        if (!user) return;

        const storageKey = `${SURVEY_SHOWN_STORAGE_PREFIX}${user.id}`;
        if (localStorage.getItem(storageKey)) return;

        posthog.capture('acquisition_survey_requested', {
            survey_id: ACQUISITION_SURVEY_ID || null,
        });

        if (ACQUISITION_SURVEY_ID) {
            posthog.displaySurvey(ACQUISITION_SURVEY_ID);
        } else {
            console.warn('VITE_PUBLIC_POSTHOG_ACQUISITION_SURVEY_ID is not set; configure it to show the PostHog survey.');
        }

        localStorage.setItem(storageKey, '1');
    }, [user]);

    return null;
}
