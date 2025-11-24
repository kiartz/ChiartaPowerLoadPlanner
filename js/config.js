/**
 * PowerLoad Planner - Configuration
 * Centralizes all constants used across the application.
 */

const PLP_CONFIG = {
    VOLTAGE: 230,

    OUTLET_CAPACITY_WATTS: {
        '16A': 3680,
        '32A': 7360,
        '63A': 14490,
        '125A': 28750,
        '400A': 92000,
        'Socapex': 3680
    },

    INPUT_CAPACITY_AMPS: {
        'CEE 16A 3p': 16,
        'CEE 32A 3p': 32,
        'CEE 63A 3p': 63,
        'CEE 16A 5p': 16,
        'CEE 32A 5p': 32,
        'CEE 63A 5p': 63,
        'CEE 125A 5p': 125,
        'Powerlock 400A': 400
    },

    OUTLET_TO_INPUT_MAPPING: {
        'Monofase 220V 16A': 'CEE 16A 3p',
        'Monofase 220V 32A': 'CEE 32A 3p',
        'Monofase 220V 63A': 'CEE 63A 3p',
        'Pentapolare 380V 16A': 'CEE 16A 5p',
        'Pentapolare 380V 32A': 'CEE 32A 5p',
        'Pentapolare 380V 63A': 'CEE 63A 5p',
        'Pentapolare 380V 125A': 'CEE 125A 5p',
        'Powerlock 400A': 'Powerlock 400A'
    }
};
