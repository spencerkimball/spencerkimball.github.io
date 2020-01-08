#!/usr/bin/env python3.7
# -*- coding: utf-8 -*-
#
# Copyright 2014 Google Inc. All Rights Reserved.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#      http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""Simple command-line sample for the Calendar API.
Command-line application that retrieves the list of the user's calendars."""

import sys

from oauth2client import client
from googleapiclient import sample_tools


def main(argv):
  # Authenticate and construct service.
  service, flags = sample_tools.init(
    argv, 'calendar', 'v3', __doc__, __file__,
    scope='https://www.googleapis.com/auth/calendar.readonly')

  try:
    cal_id = 'spencer@cockroachlabs.com'
    page_token = None
    while True:
      event_list = service.events().list(
        calendarId=cal_id, pageToken=page_token).execute()
      for event_list_entry in event_list['items']:
        print (event_list_entry)
        page_token = event_list.get('nextPageToken')
        if not page_token:
          break

  except client.AccessTokenRefreshError:
    print('The credentials have been revoked or expired, please re-run'
          'the application to re-authorize.')

if __name__ == '__main__':
    main(sys.argv)
