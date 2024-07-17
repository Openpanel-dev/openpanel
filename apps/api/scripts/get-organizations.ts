// import { clerkClient } from '@clerk/fastify';

import { db } from '@openpanel/db';

// import { db } from '@openpanel/db';

// type Fn<T = unknown> = (args: { limit: number; offset: number }) => Promise<{
//   data: T[];
//   totalCount: number;
// }>;

// function getAllDataByPagination<T extends Fn>(
//   cb: T
// ): Promise<Awaited<ReturnType<T>>['data']> {
//   const data: Awaited<ReturnType<T>>['data'] = [];
//   async function getData(page = 0) {
//     console.log(`getData with offset ${page * 100}`);
//     const response = await cb({
//       limit: 100,
//       offset: page * 100,
//     });
//     if (response.data.length !== 0) {
//       data.push(...response.data);
//       await getData(page + 1);
//     }
//     await new Promise((resolve) => setTimeout(resolve, 100));
//   }

//   return getData().then(() => data);
// }

// async function main() {
//   const organizations = await getAllDataByPagination(
//     clerkClient.organizations.getOrganizationList.bind(
//       clerkClient.organizations
//     )
//   );
//   const users = await getAllDataByPagination(
//     clerkClient.users.getUserList.bind(clerkClient.users)
//   );

//   console.log(`Found ${organizations.length} organizations`);
//   console.log(`Found ${users.length} users`);

//   for (const user of users.slice(-10)) {
//     const email = user.primaryEmailAddress?.emailAddress;
//     console.log('Check', email);

//     try {
//       if (email) {
//         const exists = await db.user.findUnique({
//           where: {
//             id: user.id,
//           },
//         });

//         if (exists) {
//           console.log('already exists');
//         } else {
//           await db.user.create({
//             data: {
//               id: user.id,
//               email: email,
//               firstName: user.firstName,
//               lastName: user.lastName,
//             },
//           });
//         }
//       } else {
//         console.log('No email?', user);
//       }
//     } catch (e) {
//       console.log('ERROR');
//       console.log('');
//       console.log('');
//       console.dir(user, { depth: null });

//       console.log('');
//       console.log('');
//       console.log('');
//     }
//   }

//   for (const org of organizations.slice(-20)) {
//     try {
//       if (org.slug) {
//         const exists = await db.organization.findUnique({
//           where: {
//             id: org.slug,
//           },
//         });

//         if (exists) {
//           console.log('already exists org');
//         } else {
//           const clerkOrgMembers =
//             await clerkClient.organizations.getOrganizationMembershipList({
//               organizationId: org.id,
//             });

//           const members = clerkOrgMembers.data.map((member) => {
//             const user = users.find(
//               (u) => u.id === member.publicUserData?.userId
//             );
//             return {
//               userId: member.publicUserData?.userId,
//               role: member.role,
//               email: user!.primaryEmailAddress!.emailAddress,
//             };
//           });

//           await db.organization.create({
//             data: {
//               id: org.slug,
//               name: org.name,
//               createdBy: {
//                 connect: {
//                   id: org.createdBy,
//                 },
//               },
//               members: {
//                 create: members,
//               },
//             },
//           });

//           const invites =
//             await clerkClient.organizations.getOrganizationInvitationList({
//               organizationId: org.id,
//               status: ['pending'],
//             });

//           for (const invite of invites.data) {
//             await db.member.create({
//               data: {
//                 email: invite.emailAddress,
//                 organizationId: org.slug,
//                 role: invite.role,
//                 userId: null,
//                 meta: {
//                   access: invite.publicMetadata?.access as string[],
//                   invitationId: invite.id,
//                 },
//               },
//             });
//           }
//         }
//       } else {
//         console.log('org does not have any slug', org);
//       }
//     } catch (e) {
//       console.log('ERROR');
//       console.log('');
//       console.log('');
//       console.dir(org, { depth: null });
//       console.log('');
//       console.log('');
//       console.log('');
//     }
//   }

//   process.exit(0);
// }

// main();

async function main() {
  const organization = await db.organization.findUnique({
    where: {
      id: 'openpanel-dev',
      members: {
        some: {
          userId: 'user_2cEoI8b1SuEFbZERGEAyVvC676F',
        },
      },
    },
    include: {
      members: {
        select: {
          role: true,
          user: true,
        },
      },
    },
  });

  console.dir(organization, { depth: null });
}
main();
